import { isIdle } from '../core/types';
import { effectiveDef } from '../data/services';
import type { Game } from '../core/Game';
import type { System } from '../core/System';

declare module '../core/Game' {
  interface SystemMap {
    sanitation: SanitationSystem;
  }
}

/**
 * Мусор и погребение. Здания производят мусор, жители умирают; мусоровозы и катафалки из свалок, мусоросжигателей,
 * кладбищ и крематориев вывозят отходы. Невывезенное снижает счастье, а тела повышают смертность.
 */
export class SanitationSystem implements System {
  readonly id = 'sanitation';
  readonly order = 47;
  /** суммарный мусор в зданиях */
  garbageTotal = 0;
  /** число зданий с переполненным мусором */
  overflowing = 0;
  bodiesWaiting = 0;
  deathsMonth = 0;
  /** заполненность хранилищ отходов / кладбищ 0..1 */
  wasteFill = 0;
  morgueFill = 0;
  private _game!: Game;
  private _acc = 0;
  private _deathAcc = new Map<number, number>();
  private _targeted = new Set<number>();
  private _warned = { waste: false, morgue: false };

  init(game: Game): void {
    this._game = game;
    game.bus.on('time:month', () => (this.deathsMonth = 0));
  }

  update(dt: number): void {
    if (dt <= 0) return;
    const c = this._game.config.garbage;
    this._acc += dt;
    if (this._acc < c.interval) return;
    const step = this._acc;
    this._acc = 0;
    this._produce(step);
    this._process(step);
    this._dispatchGarbage();
    this._dispatchHearses();
    this._stats();
  }

  private _produce(dt: number): void {
    const g = this._game;
    const gc = g.config.garbage;
    const dc = g.config.death;
    const maps = g.get('maps');
    for (const b of g.world.list()) {
      if (isIdle(b)) continue;
      const housing = b.kind === 'zone' && g.zoneTypes.require(b.zone).housing;
      const rate = (housing ? b.pop * gc.perResident : (b.kind === 'zone' ? b.workers : b.jobs * 0.5) * gc.perJob) * g.get('mods').mul('garbage');
      b.garbage = Math.min(gc.cap * 1.25, b.garbage + rate * dt);
      b.deadFor = b.dead > 0 ? b.deadFor + dt : 0;
      if (!housing || b.pop < 1) continue;
      const health = maps.sample('health', b.x, b.z);
      const per = b.pop * dc.rate * (1 - health * dc.healthEffect) * (b.dead > 0 ? dc.unburiedBoost : 1) * g.get('mods').mul('death');
      const acc = (this._deathAcc.get(b.id) ?? 0) + per * dt;
      if (acc >= 1) {
        this._deathAcc.set(b.id, acc - 1);
        b.pop = Math.max(0, b.pop - 1);
        b.dead++;
        this.deathsMonth++;
      } else this._deathAcc.set(b.id, acc);
    }
  }

  /** Сжигание в мусоросжигателях и крематориях. */
  private _process(dt: number): void {
    const g = this._game;
    for (const b of g.world.list()) {
      if (b.kind !== 'service' || isIdle(b)) continue;
      const d = effectiveDef(g.services.require(b.defId), b.up);
      const working = b.powered || d.powerNeed === 0;
      if (!working) continue;
      if (d.waste && d.waste.burn > 0) b.stored = Math.max(0, b.stored - d.waste.burn * dt);
      if (d.morgue && d.morgue.burn > 0) b.stored = Math.max(0, b.stored - d.morgue.burn * dt);
    }
  }

  private _dispatchGarbage(): void {
    const g = this._game;
    const gc = g.config.garbage;
    const fleet = g.get('fleet');
    const facilities = fleet.facilities('garbage').filter((f) => effectiveDef(g.services.require(f.defId), f.up).waste);
    if (!facilities.length) return;
    const cands = g.world
      .list()
      .filter((b) => b.garbage >= gc.dispatchAt && !this._targeted.has(b.id) && b.access > 0)
      .sort((a, b) => b.garbage - a.garbage);
    for (const target of cands) {
      const f = fleet.nearest('garbage', target, (x) => x.stored + gc.truckLoad <= effectiveDef(g.services.require(x.defId), x.up).waste!.capacity);
      if (!f) continue;
      this._targeted.add(target.id);
      let carried = 0;
      const ok = fleet.launch(f, target, 0xffffff, {
        onArrive: () => {
          // мусоровоз опорожняет баки не только у цели, но и у соседей по улице, пока не заполнится кузов
          const near = g.world.buildingsNear(target.x, target.z, gc.sweepRadius).filter((b) => b.garbage > 1).sort((a, b) => (a === target ? -1 : b === target ? 1 : b.garbage - a.garbage));
          for (const b of near) {
            if (carried >= gc.truckLoad) break;
            const take = Math.min(b.garbage, gc.truckLoad - carried);
            b.garbage -= take;
            carried += take;
          }
        },
        onReturn: () => {
          f.stored = Math.min(effectiveDef(g.services.require(f.defId), f.up).waste!.capacity, f.stored + carried);
          this._targeted.delete(target.id);
        },
        onFail: () => {
          // машину потеряли в пути: мусор остаётся у цели
          target.garbage = Math.min(gc.cap * 1.25, target.garbage + carried);
          this._targeted.delete(target.id);
        },
      });
      if (!ok) this._targeted.delete(target.id);
    }
  }

  private _dispatchHearses(): void {
    const g = this._game;
    const dc = g.config.death;
    const fleet = g.get('fleet');
    if (!fleet.facilities('hearse').length) return;
    const cands = g.world
      .list()
      .filter((b) => b.dead >= 1 && !this._targeted.has(b.id) && b.access > 0)
      .sort((a, b) => b.dead - a.dead);
    for (const target of cands) {
      const f = fleet.nearest('hearse', target, (x) => x.stored + dc.hearseLoad <= (effectiveDef(g.services.require(x.defId), x.up).morgue?.capacity ?? 0));
      if (!f) continue;
      this._targeted.add(target.id);
      let carried = 0;
      const ok = fleet.launch(f, target, 0xffffff, {
        onArrive: () => {
          carried = Math.min(target.dead, dc.hearseLoad);
          target.dead -= carried;
        },
        onReturn: () => {
          f.stored = Math.min(effectiveDef(g.services.require(f.defId), f.up).morgue!.capacity, f.stored + carried);
          this._targeted.delete(target.id);
        },
        onFail: () => {
          target.dead += carried;
          this._targeted.delete(target.id);
        },
      });
      if (!ok) this._targeted.delete(target.id);
    }
  }

  private _stats(): void {
    const g = this._game;
    const cap = g.config.garbage.cap;
    let gt = 0;
    let over = 0;
    let dead = 0;
    let wasteCap = 0;
    let wasteUsed = 0;
    let morgueCap = 0;
    let morgueUsed = 0;
    for (const b of g.world.list()) {
      gt += b.garbage;
      if (b.garbage > cap * g.config.garbage.unhappyAt) over++;
      dead += b.dead;
      if (b.kind === 'service') {
        const d = effectiveDef(g.services.require(b.defId), b.up);
        if (d.waste) {
          wasteCap += d.waste.capacity;
          wasteUsed += b.stored;
        }
        if (d.morgue) {
          morgueCap += d.morgue.capacity;
          morgueUsed += b.stored;
        }
      }
    }
    this.garbageTotal = gt;
    this.overflowing = over;
    this.bodiesWaiting = dead;
    this.wasteFill = wasteCap ? wasteUsed / wasteCap : 0;
    this.morgueFill = morgueCap ? morgueUsed / morgueCap : 0;
    if (this.wasteFill > 0.95 && !this._warned.waste) {
      this._warned.waste = true;
      g.message('msg.wasteFull', undefined, 'warn');
    } else if (this.wasteFill < 0.8) this._warned.waste = false;
    if (this.morgueFill > 0.95 && !this._warned.morgue) {
      this._warned.morgue = true;
      g.message('msg.morgueFull', undefined, 'warn');
    } else if (this.morgueFill < 0.8) this._warned.morgue = false;
  }
}
