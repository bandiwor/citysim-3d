import type { Building } from '../core/types';
import { generateTerrain } from './Terrain';

/** Размер клетки в мировых единицах. */
export const CELL = 8;
export const WATER_LEVEL = -0.9;

/** Класс клетки по рельефу. Land — застройка; Water — вода/берег (только мосты); Blocked — холмы/горы. */
export const Terrain = { Land: 0, Water: 1, Blocked: 2 } as const;

/** Плотные массивы состояния клеток + список зданий. Не содержит логики симуляции. */
export class World {
  readonly size: number;
  readonly seed: number;
  /** высоты вершин, (size+1)^2 */
  readonly heights: Float32Array;
  readonly terrain: Uint8Array;
  /** тип дороги + 1 (0 — нет) */
  readonly road: Uint8Array;
  /** тип зоны + 1 */
  readonly zone: Uint8Array;
  /** id здания, занимающего клетку */
  readonly occupant: Int32Array;
  readonly stop: Uint8Array;
  readonly buildings = new Map<number, Building>();
  /** растёт при добавлении/удалении зданий — для кэшей */
  version = 0;
  private _nextId = 1;
  private _cacheVersion = -1;
  private _cache: Building[] = [];

  constructor(size: number, seed: number) {
    this.size = size;
    this.seed = seed;
    const n = size * size;
    this.heights = new Float32Array((size + 1) * (size + 1));
    this.terrain = new Uint8Array(n);
    this.road = new Uint8Array(n);
    this.zone = new Uint8Array(n);
    this.occupant = new Int32Array(n);
    this.stop = new Uint8Array(n);
    generateTerrain(this);
  }

  get cells(): number {
    return this.size * this.size;
  }

  idx(x: number, y: number): number {
    return y * this.size + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  newId(): number {
    return this._nextId++;
  }

  /** После загрузки сохранения счётчик id нужно продвинуть. */
  bumpId(id: number): void {
    if (id >= this._nextId) this._nextId = id + 1;
  }

  vertexHeight(i: number, j: number): number {
    return this.heights[j * (this.size + 1) + i];
  }

  heightAt(wx: number, wz: number): number {
    const fx = Math.min(Math.max(wx / CELL, 0), this.size - 0.001);
    const fz = Math.min(Math.max(wz / CELL, 0), this.size - 0.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const h00 = this.vertexHeight(i, j);
    const h10 = this.vertexHeight(i + 1, j);
    const h01 = this.vertexHeight(i, j + 1);
    const h11 = this.vertexHeight(i + 1, j + 1);
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  isFree(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    return this.terrain[i] === Terrain.Land && this.road[i] === 0 && this.occupant[i] === 0;
  }

  /** Все здания (кэшированный массив; не модифицировать). */
  list(): readonly Building[] {
    if (this._cacheVersion !== this.version) {
      this._cache = [...this.buildings.values()];
      this._cacheVersion = this.version;
    }
    return this._cache;
  }

  buildingAt(x: number, y: number): Building | undefined {
    if (!this.inBounds(x, y)) return undefined;
    const id = this.occupant[this.idx(x, y)];
    return id ? this.buildings.get(id) : undefined;
  }
}
