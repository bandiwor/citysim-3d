import type { Game } from '../core/Game';
import type { System } from '../core/System';
import { clamp } from '../core/Rng';
import { Terrain } from '../world/World';

declare module '../core/Game' {
  interface SystemMap {
    maps: MapsSystem;
  }
}

/**
 * Карты влияния по клеткам: покрытие служб (police/fire/health/education/park/…),
 * загрязнение, шум от трафика и стоимость земли. Типы покрытий задаются данными служб.
 */
export class MapsSystem implements System {
  readonly id = 'maps';
  readonly order = 30;
  pollution = new Float32Array(0);
  noise = new Float32Array(0);
  landValue = new Float32Array(0);
  version = 0;
  private _coverage = new Map<string, Float32Array>();
  private _shore = new Float32Array(0);
  private _game!: Game;
  private _dirty = true;
  private _timer = 0;
  private _utilVersion = -1;

  init(game: Game): void {
    this._game = game;
    const n = game.world.cells;
    this.pollution = new Float32Array(n);
    this.noise = new Float32Array(n);
    this.landValue = new Float32Array(n).fill(0.3);
    this._shore = new Float32Array(n);
    const w = game.world;
    for (let y = 0; y < w.size; y++) {
      for (let x = 0; x < w.size; x++) {
        let near = false;
        for (let dy = -3; dy <= 3 && !near; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            if (w.inBounds(x + dx, y + dy) && w.terrain[w.idx(x + dx, y + dy)] === Terrain.Water) {
              near = true;
              break;
            }
          }
        }
        this._shore[y * w.size + x] = near ? 0.1 : 0;
      }
    }
    const mark = (): void => {
      this._dirty = true;
    };
    game.bus.on('building:added', mark);
    game.bus.on('building:removed', mark);
    game.bus.on('building:updated', mark);
    game.bus.on('economy:changed', mark);
  }

  coverage(type: string): Float32Array {
    let a = this._coverage.get(type);
    if (!a) this._coverage.set(type, (a = new Float32Array(this._game.world.cells)));
    return a;
  }

  update(_dt: number, realDt: number): void {
    this._timer += realDt;
    const uv = this._game.get('utility').version;
    if (uv !== this._utilVersion) {
      this._utilVersion = uv;
      this._dirty = true;
    }
    if ((this._dirty && this._timer > 0.4) || this._timer > 3) {
      this._timer = 0;
      this._dirty = false;
      this.recompute();
    }
  }

  recompute(): void {
    const g = this._game;
    const w = g.world;
    const n = w.size;
    for (const a of this._coverage.values()) a.fill(0);
    this.pollution.fill(0);
    this.noise.fill(0);
    const funding = g.get('economy').funding;

    const stamp = (arr: Float32Array, cx: number, cy: number, r: number, s: number, additive: boolean): void => {
      const x0 = Math.max(0, Math.floor(cx - r));
      const x1 = Math.min(n - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r));
      const y1 = Math.min(n - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
          if (d >= 1) continue;
          const v = s * (1 - d * d);
          const i = y * n + x;
          if (additive) arr[i] += v;
          else if (v > arr[i]) arr[i] = v;
        }
      }
    };

    for (const b of w.list()) {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      if (b.kind === 'service') {
        const d = g.services.require(b.defId);
        if (b.abandoned) continue;
        const working = b.powered || d.powerNeed === 0;
        if (d.coverage && working) {
          const f = funding[d.fundingGroup] ?? 1;
          stamp(this.coverage(d.coverage.type), cx, cy, d.coverage.radius, d.coverage.strength * Math.min(1.3, f), false);
        }
        if (d.pollution) stamp(this.pollution, cx, cy, d.pollution.radius, d.pollution.strength, true);
      } else if (!b.abandoned) {
        const z = g.zoneTypes.require(b.zone);
        const p = z.levels[b.level - 1].pollution;
        if (p > 0) stamp(this.pollution, cx, cy, 5, 0.6 * p, true);
      }
    }

    // шум от дорожного движения
    const occ = g.get('traffic').occupancy;
    for (let i = 0; i < occ.length; i++) {
      if (occ[i] > 1) stamp(this.noise, (i % n) + 0.5, ((i / n) | 0) + 0.5, 2.5, Math.min(0.25, occ[i] * 0.03), true);
    }

    const park = this.coverage('park');
    const pol = this.coverage('police');
    const hea = this.coverage('health');
    const fir = this.coverage('fire');
    const edu = this.coverage('education');
    for (let i = 0; i < w.cells; i++) {
      this.pollution[i] = Math.min(1, this.pollution[i]);
      this.noise[i] = Math.min(1, this.noise[i]);
      this.landValue[i] = clamp(
        0.27 + 0.25 * park[i] + 0.12 * pol[i] + 0.1 * hea[i] + 0.08 * fir[i] + 0.1 * edu[i] + this._shore[i] - 0.5 * this.pollution[i] - 0.2 * this.noise[i],
        0,
        1,
      );
    }
    this.version++;
  }
}
