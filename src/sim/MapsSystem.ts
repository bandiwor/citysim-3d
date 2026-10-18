import { isIdle } from '../core/types';
import { effectiveDef } from '../data/services';
import { CELL } from '../config/constants';
import type { Game } from '../core/Game';
import type { System } from '../core/System';
import { computeShore } from '../workers/maps';
import type { MapSource, MapsOutput } from '../workers/protocol';
import { Terrain } from '../world/Terrain';

declare module '../core/Game' {
  interface SystemMap {
    maps: MapsSystem;
  }
}

/**
 * Карты влияния по клеткам: покрытие служб (police/fire/health/education/park/…), загрязнение,
 * шум от трафика и стоимость земли. Тяжёлый расчёт выполняется в воркере (ComputeBackend.computeMaps).
 */
export class MapsSystem implements System {
  readonly id = 'maps';
  readonly order = 30;
  pollution: Float32Array = new Float32Array(0);
  noise: Float32Array = new Float32Array(0);
  landValue: Float32Array = new Float32Array(0);
  version = 0;
  private _layers = new Map<string, Float32Array>();
  private _shore: Float32Array = new Float32Array(0);
  private _game!: Game;
  private _dirty = true;
  private _busy = false;
  private _timer = 0;
  private _utilVersion = -1;

  init(game: Game): void {
    this._game = game;
    const w = game.world;
    this.pollution = new Float32Array(w.cells);
    this.noise = new Float32Array(w.cells);
    this.landValue = new Float32Array(w.cells).fill(game.config.maps.landValue.base);
    this._shore = computeShore(w.terrain, w.size, game.config.maps.shoreRadius, game.config.maps.shoreBonus, Terrain.Water);
    const mark = (): void => {
      this._dirty = true;
    };
    game.bus.on('building:added', mark);
    game.bus.on('building:removed', mark);
    game.bus.on('building:updated', mark);
    game.bus.on('economy:changed', mark);
  }

  /** Слой покрытия (создаётся пустым при первом обращении). */
  coverage(type: string): Float32Array {
    if (type === 'pollution') return this.pollution;
    if (type === 'noise') return this.noise;
    if (type === 'landValue') return this.landValue;
    let a = this._layers.get(type);
    if (!a) this._layers.set(type, (a = new Float32Array(this._game.world.cells)));
    return a;
  }

  /** Значение слоя в точке мира. */
  sample(type: string, x: number, z: number): number {
    return this.coverage(type)[this._game.world.gridIndex(x, z)];
  }

  update(_dt: number, realDt: number): void {
    const c = this._game.config.maps;
    this._timer += realDt;
    const uv = this._game.get('utility').version;
    if (uv !== this._utilVersion) {
      this._utilVersion = uv;
      this._dirty = true;
    }
    if (this._busy) return;
    if ((this._dirty && this._timer > c.interval) || this._timer > c.maxInterval) {
      this._timer = 0;
      this._dirty = false;
      void this.recompute();
    }
  }

  /** Собирает источники влияния по зданиям и трафику. */
  collectSources(): MapSource[] {
    const g = this._game;
    const c = g.config.maps;
    const funding = g.get('economy').funding;
    const sources: MapSource[] = [];
    for (const b of g.world.list()) {
      if (isIdle(b)) continue;
      if (b.kind === 'service') {
        const d = effectiveDef(g.services.require(b.defId), b.up);
        const working = b.powered || d.powerNeed === 0;
        if (d.coverage && working) {
          const f = Math.min(c.maxFundingEffect, funding[d.fundingGroup] ?? 1);
          sources.push({ layer: d.coverage.type, x: b.x, z: b.z, r: d.coverage.radius * CELL, strength: d.coverage.strength * f, additive: false });
        }
        if (d.pollution) sources.push({ layer: 'pollution', x: b.x, z: b.z, r: d.pollution.radius * CELL, strength: d.pollution.strength, additive: true });
      } else {
        const p = g.zoneTypes.require(b.zone).levels[b.level - 1].pollution;
        if (p > 0) sources.push({ layer: 'pollution', x: b.x, z: b.z, r: c.industryPollutionRadius * CELL, strength: c.industryPollution * p, additive: true });
      }
    }
    const traffic = g.get('traffic');
    for (const [edgeId, n] of traffic.occupancy) {
      if (n <= 1) continue;
      const e = g.world.graph.edges.get(edgeId);
      if (!e) continue;
      const mid = g.world.graph.pointAt(e, e.len / 2);
      sources.push({ layer: 'noise', x: mid.x, z: mid.z, r: c.noiseRadius * CELL, strength: Math.min(c.noiseCap, n * c.noisePerCar), additive: true });
    }
    return sources;
  }

  async recompute(): Promise<void> {
    const g = this._game;
    const c = g.config.maps;
    this._busy = true;
    try {
      const out = await g.compute.computeMaps({
        size: g.world.size,
        cell: CELL,
        sources: this.collectSources(),
        layers: ['pollution', 'noise', ...g.services.all().flatMap((s) => (s.coverage ? [s.coverage.type] : []))],
        shore: this._shore,
        landValue: c.landValue,
      });
      this.apply(out);
    } finally {
      this._busy = false;
    }
  }

  apply(out: MapsOutput): void {
    for (const [name, arr] of Object.entries(out.layers)) {
      if (name === 'pollution') this.pollution = arr;
      else if (name === 'noise') this.noise = arr;
      else this._layers.set(name, arr);
    }
    this.landValue = out.landValue;
    this.version++;
  }
}
