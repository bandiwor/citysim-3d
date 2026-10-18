import { CELL } from '../config/constants';
import type { GameConfig } from '../config/gameConfig';
import type { Building, BusStop, Prop } from '../core/types';
import { obbContains, type Obb } from './geometry';
import { RoadGraph } from './RoadGraph';
import { SpatialHash } from './SpatialHash';
import { classifyTerrain, Terrain, type TerrainData } from './Terrain';
import { ZoneGrid } from './ZoneGrid';

export { CELL, Terrain };
export const WATER_LEVEL = -0.9;

/** Состояние мира: рельеф (сетка клеток), граф дорог, клетки зонирования, здания и остановки. Без логики симуляции. */
export class World {
  readonly size: number;
  readonly seed: number;
  /** высоты вершин, (size+1)^2 */
  readonly heights: Float32Array;
  /** класс рельефа клеток сетки */
  readonly terrain: Uint8Array;
  readonly graph = new RoadGraph();
  readonly zones = new ZoneGrid();
  readonly buildings = new Map<number, Building>();
  stops: BusStop[] = [];
  /** деревья и камни, посаженные игроком */
  readonly props = new Map<number, Prop>();
  /** стёртые ластиком процедурные деревья (id из TreeView) */
  readonly erasedTrees = new Set<number>();
  /** изменённые игроком вершины рельефа: индекс → высота (для сохранения) */
  readonly terrainEdits = new Map<number, number>();
  /** растёт при добавлении/удалении зданий — для кэшей */
  version = 0;
  private _nextId = 1;
  private _cacheVersion = -1;
  private _cache: Building[] = [];
  private _hash = new SpatialHash(CELL * 2);

  constructor(data: TerrainData, seed: number, readonly cfg: GameConfig) {
    this.size = data.size;
    this.seed = seed;
    this.heights = data.heights;
    this.terrain = data.terrain;
  }

  /** сторона карты, ед. */
  get extent(): number {
    return this.size * CELL;
  }

  get cells(): number {
    return this.size * this.size;
  }

  newId(): number {
    return this._nextId++;
  }

  bumpId(id: number): void {
    if (id >= this._nextId) this._nextId = id + 1;
  }

  inBounds(x: number, z: number, margin = 0): boolean {
    return x >= margin && z >= margin && x <= this.extent - margin && z <= this.extent - margin;
  }

  /** индекс клетки сетки под точкой (с ограничением по краям) */
  gridIndex(x: number, z: number): number {
    const cx = Math.min(this.size - 1, Math.max(0, Math.floor(x / CELL)));
    const cz = Math.min(this.size - 1, Math.max(0, Math.floor(z / CELL)));
    return cz * this.size + cx;
  }

  terrainAt(x: number, z: number): number {
    if (!this.inBounds(x, z)) return Terrain.Blocked;
    return this.terrain[this.gridIndex(x, z)];
  }

  /** Худший класс рельефа под основанием (центр, углы, середины сторон). */
  footprintTerrain(o: Obb): number {
    const c = Math.cos(o.rot);
    const s = Math.sin(o.rot);
    let worst: number = Terrain.Land;
    for (const [u, v] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const px = o.x + c * o.hw * u + s * o.hd * v;
      const pz = o.z - s * o.hw * u + c * o.hd * v;
      const t = this.terrainAt(px, pz);
      if (t === Terrain.Blocked) return t;
      if (t === Terrain.Water) worst = t;
    }
    return worst;
  }

  /** Меняет высоту вершины и запоминает правку. */
  setVertexHeight(i: number, j: number, h: number): void {
    const k = j * (this.size + 1) + i;
    this.heights[k] = h;
    this.terrainEdits.set(k, h);
  }

  /** Пересчитывает классы клеток вокруг изменённых вершин (включительно). */
  reclassify(i0: number, j0: number, i1: number, j1: number): void {
    classifyTerrain(this.heights, this.terrain, this.size, this.cfg.world.flatEpsilon, i0 - 1, j0 - 1, i1, j1);
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

  // ---------- здания ----------

  obbOf(b: Building): Obb {
    return { x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2, rot: b.rot };
  }

  registerBuilding(b: Building): void {
    this.buildings.set(b.id, b);
    this.bumpId(b.id);
    const r = Math.hypot(b.w, b.d) / 2;
    this._hash.insert(b.id, b.x - r, b.z - r, b.x + r, b.z + r);
    this.version++;
  }

  unregisterBuilding(b: Building): void {
    this.buildings.delete(b.id);
    this._hash.remove(b.id);
    this.version++;
  }

  /** Все здания (кэшированный массив; не модифицировать). */
  list(): readonly Building[] {
    if (this._cacheVersion !== this.version) {
      this._cache = [...this.buildings.values()];
      this._cacheVersion = this.version;
    }
    return this._cache;
  }

  /** Здания, чьи габариты могут оказаться в радиусе r от точки. */
  buildingsNear(x: number, z: number, r: number): Building[] {
    const out: Building[] = [];
    for (const id of this._hash.query(x - r, z - r, x + r, z + r)) {
      const b = this.buildings.get(id);
      if (b) out.push(b);
    }
    return out;
  }

  buildingAt(x: number, z: number): Building | undefined {
    for (const b of this.buildingsNear(x, z, 1)) if (obbContains(this.obbOf(b), { x, z })) return b;
    return undefined;
  }
}
