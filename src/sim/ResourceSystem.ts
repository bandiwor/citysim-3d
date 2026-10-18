import { CELL } from '../config/constants';
import type { Game } from '../core/Game';
import { smoothstep } from '../core/Rng';
import type { System } from '../core/System';
import { isIdle, type Building } from '../core/types';
import { RESOURCE_KINDS, SPECS, specDef, type ResourceKind } from '../data/resources';
import { Noise } from '../world/Noise';
import { Terrain } from '../world/Terrain';

declare module '../core/Game' {
  interface SystemMap {
    resources: ResourceSystem;
  }
}

/**
 * Природные ресурсы карты: плодородная земля, лес, руда и нефть (0..1 на клетку), детерминированно из seed и рельефа.
 * Промышленность на богатом ресурсом месте специализируется (ферма, лесопилка, шахта, вышка): другие модели, рабочие места,
 * загрязнение и сырьё на экспорт к соседям. Руда и нефть со временем истощаются.
 */
export class ResourceSystem implements System {
  readonly id = 'resources';
  readonly order = 3;
  readonly maps = {} as Record<ResourceKind, Float32Array>;
  version = 0;
  private _base = {} as Record<ResourceKind, Float32Array>;
  private _game!: Game;

  init(game: Game): void {
    this._game = game;
    this._generate();
    game.bus.on('building:spawning', (b) => this._specialize(b));
    game.bus.on('building:updated', (b) => this._recheck(b));
    game.bus.on('time:month', () => this._extract());
  }

  /** Значение ресурса в точке мира. */
  sample(kind: ResourceKind, x: number, z: number): number {
    return this.maps[kind][this._game.world.gridIndex(x, z)];
  }

  /** Самый богатый ресурс клетки и его значение. */
  dominant(x: number, z: number): { kind: ResourceKind; value: number } {
    let best: { kind: ResourceKind; value: number } = { kind: 'fertile', value: 0 };
    for (const k of RESOURCE_KINDS) {
      const v = this.sample(k, x, z);
      if (v > best.value) best = { kind: k, value: v };
    }
    return best;
  }

  /** Специализированные предприятия по видам (для панелей). */
  counts(): Record<string, { buildings: number; workers: number }> {
    const out: Record<string, { buildings: number; workers: number }> = {};
    for (const s of SPECS) out[s.id] = { buildings: 0, workers: 0 };
    for (const b of this._game.world.list()) {
      if (!b.spec || isIdle(b)) continue;
      out[b.spec].buildings++;
      out[b.spec].workers += b.workers;
    }
    return out;
  }

  /** Сырьё на экспорт за месяц от здания ($): ценность ресурса × работники; фермы теряют урожай от загрязнения. */
  goodsValue(b: Building): number {
    const d = b.spec ? specDef(b.spec) : undefined;
    if (!d || isIdle(b) || !b.powered || !b.watered) return 0;
    let v = b.workers * this._game.config.trade.goodsPerWorker * d.value;
    if (d.id === 'farm') v *= 1 - Math.min(0.8, this._game.get('maps').sample('pollution', b.x, b.z));
    return v;
  }

  private _generate(): void {
    const w = this._game.world;
    const n = w.size;
    const seed = w.seed;
    const forestN = new Noise(seed + 3);
    const moistN = new Noise(seed + 17);
    const oreN = new Noise(seed + 61);
    const oilN = new Noise(seed + 73);
    for (const k of RESOURCE_KINDS) this._base[k] = new Float32Array(w.cells);
    const water = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < n && y < n && w.terrain[y * n + x] === Terrain.Water;
    for (let i = 0; i < w.cells; i++) {
      const x = i % n;
      const y = (i / n) | 0;
      if (w.terrain[i] === Terrain.Water) continue;
      const h = (w.vertexHeight(x, y) + w.vertexHeight(x + 1, y + 1)) / 2;
      const slope = Math.abs(w.vertexHeight(x + 1, y) - w.vertexHeight(x, y)) + Math.abs(w.vertexHeight(x, y + 1) - w.vertexHeight(x, y));
      let wet = 0;
      for (let dy = -3; dy <= 3 && !wet; dy++) for (let dx = -3; dx <= 3; dx++) if (water(x + dx, y + dy)) wet = 1;
      const moist = moistN.fbm(x * 0.05, y * 0.05, 2);
      // плодородие: низины и равнины, ровно, влажно, у воды
      this._base.fertile[i] = Math.min(1, (1 - smoothstep(3, 9, h)) * (1 - smoothstep(0.6, 2.5, slope)) * (0.35 + 0.45 * smoothstep(-0.3, 0.4, moist) + 0.3 * wet));
      // лес — тот же шум, что у растительности (TreeView), поэтому лесопилки встают там, где на карте леса
      const forest = forestN.fbm(x * 0.07 + 5, y * 0.07 + 5, 3) * 0.7 + forestN.noise(x * 0.23, y * 0.23) * 0.3;
      this._base.forest[i] = h > 34 ? 0 : smoothstep(0.05, 0.4, forest);
      // руда — в холмах и горах, жилами
      const vein = oreN.fbm(x * 0.09, y * 0.09, 3);
      this._base.ore[i] = Math.min(1, smoothstep(5, 20, h) * smoothstep(-0.15, 0.35, vein) + 0.6 * smoothstep(0.42, 0.6, vein));
      // нефть — редкие пятна на равнинах
      this._base.oil[i] = h > 10 ? 0 : smoothstep(0.3, 0.52, oilN.fbm(x * 0.05 + 11, y * 0.05 - 7, 2));
    }
    for (const k of RESOURCE_KINDS) this.maps[k] = this._base[k].slice();
    this.version++;
  }

  /** Новое промышленное здание (не офисы) на богатом ресурсом месте получает специализацию. */
  private _specialize(b: Building): void {
    if (b.kind !== 'zone' || b.zone !== 'ind' || b.level >= 3) return;
    const best = this._bestSpec(b);
    b.spec = best ?? '';
  }

  private _bestSpec(b: Building): string | null {
    const th = this._game.config.resources.threshold;
    let best: string | null = null;
    let bestV = th;
    for (const s of SPECS) {
      const v = this.sample(s.resource, b.x, b.z);
      if (v >= bestV) {
        bestV = v;
        best = s.id;
      }
    }
    return best;
  }

  /** После повышения уровня: офисам специализация не нужна. */
  private _recheck(b: Building): void {
    if (b.spec && (b.zone !== 'ind' || b.level >= 3)) {
      b.spec = '';
      this._game.builder.applyStats(b);
    }
  }

  /** Раз в месяц шахты и вышки вычерпывают запасы вокруг; иссякшее месторождение — обычная промышленность. */
  private _extract(): void {
    const g = this._game;
    const c = g.config.resources;
    const w = g.world;
    let changed = false;
    for (const b of w.list()) {
      const d = b.spec ? specDef(b.spec) : undefined;
      if (!d?.depletes || isIdle(b) || b.workers <= 0) continue;
      const map = this.maps[d.resource];
      const cx = Math.floor(b.x / CELL);
      const cz = Math.floor(b.z / CELL);
      const take = c.depletion * b.workers;
      for (let dz = -c.radius; dz <= c.radius; dz++) {
        for (let dx = -c.radius; dx <= c.radius; dx++) {
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= w.size || z >= w.size) continue;
          const i = z * w.size + x;
          map[i] = Math.max(0, map[i] - take / (1 + Math.hypot(dx, dz)));
        }
      }
      changed = true;
      if (this.sample(d.resource, b.x, b.z) < c.threshold * 0.5) {
        b.spec = '';
        g.builder.applyStats(b);
        g.bus.emit('building:updated', b);
        g.message(`msg.resDepleted.${d.resource}`, undefined, 'warn');
      }
    }
    if (changed) this.version++;
  }

  /** Сохраняются только вычерпанные клетки: [индекс, остаток × 1000]. */
  saveState(): unknown {
    const out: number[] = [];
    for (const k of ['ore', 'oil'] as const) {
      const a = this.maps[k];
      const base = this._base[k];
      for (let i = 0; i < a.length; i++) if (base[i] - a[i] > 0.002) out.push(k === 'ore' ? i : -i - 1, Math.round(a[i] * 1000));
    }
    return out;
  }

  loadState(data: unknown): void {
    if (!Array.isArray(data)) return;
    for (let j = 0; j + 1 < data.length; j += 2) {
      const raw = Number(data[j]);
      const map = raw >= 0 ? this.maps.ore : this.maps.oil;
      const i = raw >= 0 ? raw : -raw - 1;
      if (i < map.length) map[i] = Number(data[j + 1]) / 1000;
    }
    this.version++;
  }
}
