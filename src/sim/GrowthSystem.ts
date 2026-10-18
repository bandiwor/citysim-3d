import type { Game } from '../core/Game';
import type { System } from '../core/System';
import { clamp } from '../core/Rng';
import { isBuilding, type Building } from '../core/types';

declare module '../core/Game' {
  interface SystemMap {
    growth: GrowthSystem;
  }
}

/** Рост застройки на клетках зонирования, апгрейды, заселение, счастье и заброшенность зданий. */
export class GrowthSystem implements System {
  readonly id = 'growth';
  readonly order = 40;
  private _game!: Game;
  private _spawnAcc = 0;
  private _evalAcc = 0;

  init(game: Game): void {
    this._game = game;
  }

  update(dt: number): void {
    if (dt <= 0) return;
    const c = this._game.config.growth;
    this._spawnAcc += dt;
    while (this._spawnAcc >= c.spawnInterval) {
      this._spawnAcc -= c.spawnInterval;
      this.trySpawn();
    }
    this._evalAcc += dt;
    if (this._evalAcc >= c.evalInterval) {
      const step = this._evalAcc;
      this._evalAcc = 0;
      this.evaluate(step);
    }
  }

  /** Слагаемые счастья здания: [ключ, вклад]. Сумма даёт счастье до ограничения 0..1. */
  happinessFactors(b: Building): [string, number][] {
    const g = this._game;
    const h = g.config.happiness;
    const maps = g.get('maps');
    const st = g.get('stats');
    const rate = g.get('economy').taxes[b.zone] ?? h.taxFree;
    const at = (t: string): number => maps.sample(t, b.x, b.z);
    const f: [string, number][] = [
      ['base', h.base],
      ['police', h.police * at('police')],
      ['fire', h.fire * at('fire')],
      ['health', h.health * at('health')],
      ['park', h.park * at('park')],
      ['education', h.education * at('education')],
      ['transit', h.transit * g.get('transit').share(b.x, b.z)],
      ['pollution', h.pollution * at('pollution')],
      ['noise', h.noise * at('noise')],
      ['tax', -Math.max(0, rate - h.taxFree) * h.taxPenalty],
      ['power', b.powered ? h.powerOn : h.powerOff],
      ['water', b.watered ? h.waterOn : h.waterOff],
    ];
    if (g.zoneTypes.get(b.zone)?.housing) {
      const scale = Math.min(1, st.population / h.unemploymentPop);
      f.push(['unemployment', h.unemployment * st.unemployment * scale], ['overqualified', g.config.education.overqualified * st.overqualified * scale]);
    }
    // невывезенный мусор, тела и ограбления портят настроение
    const gc = g.config.garbage;
    f.push(['garbage', b.garbage > gc.cap * gc.unhappyAt ? gc.unhappy : 0]);
    const dc = g.config.death;
    f.push(['bodies', b.dead > 0 && b.deadFor > dc.unhappyAfter ? dc.unhappy * Math.min(1, b.dead / 3) : 0]);
    // тела у соседей, которые долго не вывозят, тоже расстраивают
    let neighbours = 0;
    for (const n of g.world.buildingsNear(b.x, b.z, dc.neighborRadius)) if (n.id !== b.id && n.deadFor > dc.unhappyAfter) neighbours++;
    f.push(['neighborBodies', dc.neighborUnhappy * Math.min(2, neighbours)]);
    f.push(['robbery', b.incident > 0 ? g.config.crime.unhappy : 0]);
    f.push(['disease', b.sick > 0 && b.pop > 0 ? g.config.disease.unhappy * Math.min(1, b.sick / b.pop) : 0]);
    f.push(['events', g.get('mods').add('happiness')]);
    return f;
  }

  /** Счастье здания 0..1 по службам, загрязнению, налогам, безработице и т.д. */
  happinessOf(b: Building): number {
    if (this._game.cheats.happyCity) return 1;
    let v = 0;
    for (const [, x] of this.happinessFactors(b)) v += x;
    return clamp(v, 0, 1);
  }

  /** Пытается заселить свободные размеченные клетки по текущему спросу. */
  trySpawn(): void {
    const g = this._game;
    const c = g.config.growth;
    const demand = g.get('demand').values;
    const net = g.get('network');
    const cells = g.world.zones.list();
    if (!cells.length) return;
    for (const z of g.zoneTypes.all()) {
      const d = demand[z.id] ?? 0;
      if (d < c.minDemand) continue;
      const attempts = Math.floor(d * c.spawnPerDemand + Math.random());
      for (let a = 0; a < attempts; a++) {
        for (let tries = 0; tries < c.spawnTries; tries++) {
          const cell = cells[Math.floor(Math.random() * cells.length)];
          if (cell.zone !== z.index + 1 || cell.building || !cell.edge) continue;
          const comp = net.compOfEdge(cell.edge);
          // здания строятся и при нехватке энергии/воды — нехватка бьёт по счастью и налогам, а не блокирует рост
          const b = g.builder.spawnOnCell(cell, z.id);
          b.comp = comp;
          break;
        }
      }
    }
  }

  /** Раз в секунду: счастье, заселение, апгрейды, заброшенность. */
  evaluate(dt: number): void {
    const g = this._game;
    const c = g.config.growth;
    const maps = g.get('maps');
    const demand = g.get('demand').raw;
    const list = [...g.world.list()];
    for (const b of list) {
      b.happiness += (this.happinessOf(b) - b.happiness) * c.happinessSmoothing;
      if (b.kind !== 'zone' || isBuilding(b)) continue;
      const z = g.zoneTypes.require(b.zone);
      const ok = b.powered && b.watered && b.access > 0;

      if (!ok) b.outage += dt;
      else b.outage = Math.max(0, b.outage - dt * 2);

      if (!b.abandoned) {
        if (b.outage > c.abandonAfterOutage || (ok && b.happiness < c.abandonHappiness && Math.random() < c.abandonHappinessChance)) {
          b.abandoned = true;
          b.pop = 0;
          b.decay = 0;
          g.bus.emit('building:updated', b);
          continue;
        }
      } else {
        b.decay += dt;
        // заброшенное здание не потребляет ресурсы, поэтому оживает только если в сети есть запас
        const supplied = b.access > 0 && g.get('utility').hasSpare(b.comp, b.powerNeed, b.waterNeed);
        if (supplied && b.happiness > c.recoverHappiness) {
          b.abandoned = false;
          b.decay = 0;
          g.bus.emit('building:updated', b);
        } else if (b.decay > c.removeAfterAbandon) g.builder.removeBuilding(b);
        continue;
      }

      if (z.housing) {
        let target = ok ? b.cap * clamp(c.moveInBase + b.happiness * c.moveInHappiness, 0, 1) : 0;
        if ((demand[z.id] ?? 0) < c.emigrateDemand) target *= c.emigrateFactor;
        target = Math.round(target);
        const step = Math.max(1, Math.round(b.cap * c.moveInStep));
        if (b.pop < target) b.pop = Math.min(target, b.pop + step);
        else if (b.pop > target) b.pop = Math.max(target, b.pop - step);
        b.pop = Math.min(Math.round(b.pop), Math.floor(b.cap));
      } else if (z.id === 'com') {
        b.goods = clamp(b.goods - c.goodsDecay * dt * (c.goodsActivity + b.workers / Math.max(1, b.jobs)), 0, 1);
      }

      if (!ok || b.con < 1) continue;
      const land = maps.sample('landValue', b.x, b.z);
      const edu = maps.sample('education', b.x, b.z);
      // богатеет (★) внутри выбранной плотности; плотность задаёт игрок заливкой
      const next = z.wealth[b.wealth];
      const cur = z.wealth[b.wealth - 1];
      if (next && land >= next.reqLand && edu >= next.reqEdu && b.happiness > c.upgradeHappiness && (demand[z.id] ?? 0) > c.upgradeDemand && Math.random() < c.upgradeChance) {
        g.builder.beginWealthUp(b, b.wealth + 1);
      } else if (b.wealth > 1 && (land < cur.reqLand - c.downgradeLandSlack || b.happiness < c.downgradeHappiness) && Math.random() < c.downgradeChance) {
        g.builder.setWealth(b, b.wealth - 1);
        b.pop = Math.min(b.pop, b.cap);
      }
    }
  }
}
