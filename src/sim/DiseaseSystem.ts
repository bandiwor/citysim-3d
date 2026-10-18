import type { Game } from '../core/Game';
import type { System } from '../core/System';
import { isIdle, type Building } from '../core/types';

declare module '../core/Game' {
  interface SystemMap {
    disease: DiseaseSystem;
  }
}

/**
 * Болезни: вспышка начинается в одном доме, заражает жителей дома, а когда больных много — соседние дома.
 * Лечат поликлиники и больницы (покрытие здравоохранения), переболевшие получают иммунитет; общий потолок
 * заболевших не даёт эпидемии выйти из-под контроля. Тяжёлые случаи заканчиваются смертью (вывозит катафалк).
 */
export class DiseaseSystem implements System {
  readonly id = 'disease';
  readonly order = 49;
  /** больных в городе и вспышек за всё время */
  sickTotal = 0;
  outbreaks = 0;
  private _game!: Game;
  private _acc = 0;
  private _deathAcc = new Map<number, number>();

  init(game: Game): void {
    this._game = game;
    game.bus.on('time:month', () => this._monthly());
  }

  /** Болезни включены: медицина открыта и город не совсем мал. */
  get active(): boolean {
    const g = this._game;
    return g.get('progress').isUnlocked('service:clinic') && g.get('stats').population >= g.config.disease.minPopulation;
  }

  /** Доля больных в городе. */
  get sickShare(): number {
    const pop = this._game.get('stats').population;
    return pop > 0 ? this.sickTotal / pop : 0;
  }

  private _housing(b: Building): boolean {
    return b.kind === 'zone' && !isIdle(b) && b.pop > 0 && !!this._game.zoneTypes.get(b.zone)?.housing;
  }

  /** Начинает вспышку в случайном жилом доме. */
  startOutbreak(target?: Building): boolean {
    const g = this._game;
    const homes = g.world.list().filter((b) => this._housing(b) && b.sick < 1);
    const b = target ?? homes[Math.floor(Math.random() * homes.length)];
    if (!b) return false;
    b.sick = Math.max(b.sick, Math.max(1, Math.round(b.pop * 0.12)));
    this.outbreaks++;
    g.message('msg.outbreak', undefined, 'warn');
    return true;
  }

  private _monthly(): void {
    const c = this._game.config.disease;
    if (!this.active) return;
    if (Math.random() < c.outbreakPerMonth * this._game.get('mods').mul('disease')) this.startOutbreak();
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this._acc += dt;
    const c = this._game.config.disease;
    if (this._acc < c.interval) return;
    const step = this._acc;
    this._acc = 0;
    this._tick(step);
  }

  private _tick(dt: number): void {
    const g = this._game;
    const c = g.config.disease;
    const maps = g.get('maps');
    const mods = g.get('mods');
    const beta = mods.mul('disease');
    const deathMul = mods.mul('death');
    const pop = Math.max(1, g.get('stats').population);
    let total = 0;
    const spreaders: Building[] = [];
    for (const b of g.world.list()) {
      if (b.sick <= 0 && b.immune <= 0) continue;
      if (!this._housing(b)) {
        b.sick = b.immune = 0;
        continue;
      }
      const n = b.pop;
      const cov = maps.sample('health', b.x, b.z);
      const cap = c.maxSickFrac * n;
      // внутри дома: заражаются ещё не болевшие
      const susceptible = Math.max(0, n - b.sick - b.immune);
      b.sick += ((b.sick * susceptible) / n) * c.homeSpread * beta * dt * (1 - cov * c.treatSpread);
      b.sick = Math.min(b.sick, cap);
      // лечение и выздоровление: поликлиника и больница ускоряют
      const rec = b.sick * (c.recover + c.treat * cov) * dt;
      b.sick = Math.max(0, b.sick - rec);
      b.immune = Math.min(n, b.immune + rec);
      b.immune = Math.max(0, b.immune - b.immune * c.immuneDecay * dt);
      // тяжёлые случаи
      const acc = (this._deathAcc.get(b.id) ?? 0) + b.sick * c.deathRate * (1 - cov * c.treatDeath) * deathMul * dt;
      if (acc >= 1) {
        this._deathAcc.set(b.id, acc - 1);
        b.pop = Math.max(0, b.pop - 1);
        b.sick = Math.max(0, b.sick - 1);
        b.dead++;
      } else this._deathAcc.set(b.id, acc);
      if (b.sick < 0.05) b.sick = 0;
      total += b.sick;
      if (b.sick / n >= c.spreadThreshold) spreaders.push(b);
    }
    // соседние дома заражаются от домов с большим числом больных; потолок на весь город
    if (total / pop < c.cityCap) {
      for (const s of spreaders) {
        const share = s.sick / s.pop;
        for (const nb of g.world.buildingsNear(s.x, s.z, c.neighborRadius)) {
          if (nb.id === s.id || !this._housing(nb)) continue;
          const cov = maps.sample('health', nb.x, nb.z);
          const p = share * c.neighborSpread * beta * (1 - cov * c.treatSpread) * dt;
          if (Math.random() < p && nb.sick < nb.pop * c.maxSickFrac) {
            nb.sick = Math.max(nb.sick, 1);
            total += 1;
          }
        }
      }
    }
    this.sickTotal = total;
  }
}
