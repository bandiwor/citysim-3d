import type { Game } from '../core/Game';
import type { System } from '../core/System';
import { clamp } from '../core/Rng';
import type { Building } from '../core/types';
import { Terrain } from '../world/World';

declare module '../core/Game' {
  interface SystemMap {
    growth: GrowthSystem;
  }
}

/** Рост застройки, апгрейды, заселение, счастье и заброшенность зданий. */
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
    this._spawnAcc += dt;
    while (this._spawnAcc >= 0.4) {
      this._spawnAcc -= 0.4;
      this._trySpawn();
    }
    this._evalAcc += dt;
    if (this._evalAcc >= 1) {
      const step = this._evalAcc;
      this._evalAcc = 0;
      this._evaluate(step);
    }
  }

  /** Счастье здания 0..1 по службам, загрязнению, налогам, безработице и т.д. */
  happinessOf(b: Building): number {
    const g = this._game;
    const maps = g.get('maps');
    const st = g.get('stats');
    const eco = g.get('economy');
    const i = b.cell;
    const cov = (t: string): number => maps.coverage(t)[i];
    const rate = eco.taxes[b.zone] ?? 9;
    let h =
      0.3 +
      0.15 * cov('police') +
      0.1 * cov('fire') +
      0.1 * cov('health') +
      0.12 * cov('park') +
      0.05 * cov('education') +
      0.08 * g.get('transit').share(i) -
      0.38 * maps.pollution[i] -
      0.18 * maps.noise[i] -
      Math.max(0, rate - 10) * 0.02 +
      (b.powered ? 0.12 : -0.22) +
      (b.watered ? 0.1 : -0.22);
    if (b.zone === 'res') h -= 0.3 * st.unemployment * Math.min(1, st.population / 200);
    return clamp(h, 0, 1);
  }

  private _trySpawn(): void {
    const g = this._game;
    const w = g.world;
    const demand = g.get('demand').values;
    const util = g.get('utility');
    const net = g.get('network');
    for (const z of g.zoneTypes.all()) {
      const d = demand[z.id] ?? 0;
      if (d < 0.03) continue;
      const attempts = Math.floor(d * 3 + Math.random());
      for (let a = 0; a < attempts; a++) {
        for (let tries = 0; tries < 40; tries++) {
          const i = Math.floor(Math.random() * w.cells);
          if (w.zone[i] !== z.index + 1 || w.occupant[i] !== 0 || w.road[i] !== 0 || w.terrain[i] !== Terrain.Land) continue;
          const x = i % w.size;
          const y = (i / w.size) | 0;
          const access = g.builder.findAccess(x, y, 1, 1);
          if (access < 0) continue;
          const lv = z.levels[0];
          if (!util.hasSpare(net.comp[access], lv.capacity * z.powerPer, lv.capacity * z.waterPer)) continue;
          const b = g.builder.createBuilding('zone', z.id, x, y, 1, 1);
          g.builder.addBuilding(b);
          util.reserve(net.comp[access], b.powerNeed, b.waterNeed);
          break;
        }
      }
    }
  }

  private _evaluate(dt: number): void {
    const g = this._game;
    const maps = g.get('maps');
    const demand = g.get('demand').values;
    const list = [...g.world.list()];
    for (const b of list) {
      b.happiness += (this.happinessOf(b) - b.happiness) * 0.4;
      if (b.kind !== 'zone') continue;
      const z = g.zoneTypes.require(b.zone);
      const lv = z.levels[b.level - 1];
      const ok = b.powered && b.watered && b.access >= 0;

      if (!ok) b.outage += dt;
      else b.outage = Math.max(0, b.outage - dt * 2);

      if (!b.abandoned) {
        if (b.outage > 30 || (b.happiness < 0.12 && Math.random() < 0.05)) {
          b.abandoned = true;
          b.pop = 0;
          b.decay = 0;
          g.bus.emit('building:updated', b);
          continue;
        }
      } else {
        b.decay += dt;
        if (ok && b.happiness > 0.3) {
          b.abandoned = false;
          b.decay = 0;
          g.bus.emit('building:updated', b);
        } else if (b.decay > 25) {
          g.builder.removeBuilding(b);
        }
        continue;
      }

      // заселение
      if (z.housing) {
        let target = ok ? b.cap * clamp(0.25 + b.happiness * 1.1, 0, 1) : 0;
        if ((demand[z.id] ?? 0) < -0.3) target *= 0.8;
        const step = Math.max(1, b.cap * 0.1);
        if (b.pop < target) b.pop = Math.min(target, b.pop + step);
        else if (b.pop > target) b.pop = Math.max(target, b.pop - step);
        b.pop = Math.min(b.pop, b.cap);
      } else if (z.id === 'com') {
        b.goods = clamp(b.goods - 0.012 * dt * (0.3 + b.workers / Math.max(1, b.jobs)), 0, 1);
      }

      if (!ok) continue;
      const land = maps.landValue[b.cell];
      const edu = maps.coverage('education')[b.cell];
      const next = z.levels[b.level];
      if (next && land >= next.reqLand && edu >= next.reqEdu && b.happiness > 0.55 && (demand[z.id] ?? 0) > 0.05 && Math.random() < 0.05) {
        g.builder.setLevel(b, b.level + 1);
      } else if (b.level > 1 && (land < lv.reqLand - 0.12 || b.happiness < 0.3) && Math.random() < 0.03) {
        g.builder.setLevel(b, b.level - 1);
        b.pop = Math.min(b.pop, b.cap);
      }
    }
  }
}
