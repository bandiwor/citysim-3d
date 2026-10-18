import { Color, Matrix4, MeshLambertMaterial, Sphere, Vector3, type BufferGeometry, type Scene } from 'three';
import { CELL } from '../config/constants';
import type { Game } from '../core/Game';
import { Rng, smoothstep } from '../core/Rng';
import { obbDist } from '../world/geometry';
import { Noise } from '../world/Noise';
import { Terrain } from '../world/Terrain';
import { graphics } from './graphics';
import { InstancePool } from './InstancePool';
import { propModel } from './propModels';
import type { View } from './View';

const PER_CELL = 4;
/** сторона участка в клетках: растения разбиты на участки, чтобы невидимые (и вне теневой камеры) отсекались целиком */
const TILE = 32;
/** дальше этого расстояния от камеры — упрощённые модели */
const LOD_FAR = 150;
/** дальше этого — мелочь (цветы, камни) не рисуется: на экране она меньше пикселя */
const SMALL_HIDE = 520;
const SMALL: ReadonlySet<string> = new Set(['flowers', 'rock']);
const KINDS = ['oak', 'pine', 'birch', 'palm', 'bush', 'flowers', 'rock', 'boulder'] as const;
type Kind = (typeof KINDS)[number];

interface Tree {
  id: number;
  kind: Kind;
  tile: number;
  x: number;
  z: number;
  s: number;
  sy: number;
  rot: number;
  color: number;
}

/** Выбор вида растения по биому клетки: высота, близость воды, «лесистость» и влажность. */
function pickKind(rng: Rng, h: number, nearWater: boolean, forest: number, moist: number): Kind | null {
  const r = rng.next();
  if (h > 34) return r < 0.16 ? 'boulder' : r < 0.4 ? 'rock' : null;
  if (h > 20) return r < 0.5 ? 'pine' : r < 0.62 ? 'boulder' : r < 0.8 ? 'rock' : 'bush';
  if (h > 7) return r < 0.42 ? 'pine' : r < 0.62 ? 'oak' : r < 0.74 ? 'birch' : r < 0.84 ? 'rock' : 'bush';
  if (nearWater) return r < 0.3 ? 'bush' : r < 0.45 ? 'palm' : r < 0.65 ? 'birch' : r < 0.8 ? 'flowers' : r < 0.9 ? 'oak' : 'rock';
  if (forest > 0.18) {
    // сухой бор против лиственного леса
    if (moist < -0.1) return r < 0.55 ? 'pine' : r < 0.75 ? 'birch' : r < 0.88 ? 'bush' : 'oak';
    return r < 0.45 ? 'oak' : r < 0.7 ? 'birch' : r < 0.82 ? 'pine' : r < 0.94 ? 'bush' : 'flowers';
  }
  if (forest > 0.02) return r < 0.4 ? 'oak' : r < 0.6 ? 'birch' : r < 0.78 ? 'bush' : r < 0.9 ? 'flowers' : 'rock';
  // луга: одинокие деревья, кусты, цветы, камни
  return r < 0.28 ? 'oak' : r < 0.44 ? 'bush' : r < 0.62 ? 'flowers' : r < 0.74 ? 'birch' : r < 0.86 ? 'rock' : 'pine';
}

/**
 * Процедурные растения: леса, рощи, луга и скалы по биомам (высота, вода, «лесистость»). Исчезают там, где проложена дорога,
 * размечена зона или стоит здание. Виды отрисовываются инстансами; ёмкость растёт с размером карты.
 */
interface Tile {
  cx: number;
  cz: number;
  pools: Map<Kind, InstancePool>;
  lod: number;
  hidden: boolean;
}

export class TreeView implements View {
  private _tiles = new Map<number, Tile>();
  private _geo = new Map<Kind, BufferGeometry[]>();
  private _trees: Tree[] = [];
  private _graphVersion = -1;
  private _zoneVersion = -1;
  private _worldVersion = -1;
  private _timer = 0;
  private _lodTimer = 1;
  private _force = true;
  private _terrainDirty = false;
  private _m = new Matrix4();
  private _visible = true;

  constructor(scene: Scene, private _game: Game, private _eye: () => Vector3 = () => new Vector3(0, 1e6, 0)) {
    const w = _game.world;
    const mat = new MeshLambertMaterial({ vertexColors: true });
    for (const k of KINDS) this._geo.set(k, [propModel(k, 0), propModel(k, 1)]);
    const rng = new Rng(w.seed + 99);
    const noise = new Noise(w.seed + 3);
    const moistN = new Noise(w.seed + 17);
    const col = new Color();
    const tilesX = Math.ceil(w.size / TILE);
    const water = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w.size && y < w.size && w.terrain[y * w.size + x] === Terrain.Water;
    for (let i = 0; i < w.cells; i++) {
      const x = i % w.size;
      const y = (i / w.size) | 0;
      const t = w.terrain[i];
      if (t === Terrain.Water) continue;
      const h = (w.vertexHeight(x, y) + w.vertexHeight(x + 1, y + 1)) / 2;
      let nearWater = false;
      for (let dy = -2; dy <= 2 && !nearWater; dy++) for (let dx = -2; dx <= 2; dx++) if (water(x + dx, y + dy)) nearWater = true;
      // лесные массивы (несколько масштабов шума, чтобы были и рощи, и большие леса, и поляны)
      const forest = noise.fbm(x * 0.07 + 5, y * 0.07 + 5, 3) * 0.7 + noise.noise(x * 0.23, y * 0.23) * 0.3;
      const moist = moistN.fbm(x * 0.05, y * 0.05, 2);
      let p: number;
      if (h > 34) p = 0.12;
      else if (h > 20) p = 0.38;
      else if (h > 7) p = 0.55;
      else if (forest > 0.18) p = 0.72;
      else if (forest > 0.02) p = 0.38;
      else p = 0.06;
      if (nearWater && h <= 0.5) p = Math.max(p, 0.2);
      // поляны внутри лесов
      p *= 1 - 0.9 * smoothstep(0.35, 0.6, moistN.noise(x * 0.18 + 40, y * 0.18 + 40));
      if (rng.next() > p) continue;
      const n = 1 + rng.int(0, PER_CELL - 1);
      const tile = Math.floor(y / TILE) * tilesX + Math.floor(x / TILE);
      for (let k = 0; k < n; k++) {
        const id = i * PER_CELL + k;
        const kind = pickKind(rng, h, nearWater, forest, moist);
        const wx = (x + 0.12 + rng.next() * 0.76) * CELL;
        const wz = (y + 0.12 + rng.next() * 0.76) * CELL;
        if (!kind || w.erasedTrees.has(id)) continue;
        // деревья заметно мельче зданий; кусты и камни ещё ниже
        const [lo, hi] = kind === 'boulder' ? [0.7, 1.2] : kind === 'rock' ? [0.5, 1.0] : kind === 'bush' || kind === 'flowers' ? [0.6, 1.0] : [0.42, 0.78];
        const s = lo + rng.next() * (hi - lo);
        const sy = s * (0.9 + rng.next() * 0.4);
        const rot = rng.next() * Math.PI * 2;
        const shade = 0.72 + rng.next() * 0.48;
        const color = kind === 'rock' || kind === 'boulder' ? col.setRGB(shade, shade, shade).getHex() : col.setRGB(shade * 0.95, shade, shade * 0.9).getHex();
        this._trees.push({ id, kind, tile, x: wx, z: wz, s, sy, rot, color });
      }
    }
    // ёмкость каждого участка — ровно под его растения (новые здесь не появляются, только исчезают)
    const counts = new Map<number, Map<Kind, number>>();
    for (const t of this._trees) {
      const m = counts.get(t.tile) ?? new Map<Kind, number>();
      m.set(t.kind, (m.get(t.kind) ?? 0) + 1);
      counts.set(t.tile, m);
    }
    const span = TILE * CELL;
    for (const [tile, m] of counts) {
      const tx = tile % tilesX;
      const tz = Math.floor(tile / tilesX);
      const cx = (tx + 0.5) * span;
      const cz = (tz + 0.5) * span;
      const pools = new Map<Kind, InstancePool>();
      // границы участка с запасом по высоте (горы, кроны)
      const bounds = new Sphere(new Vector3(cx, 20, cz), span * 0.75 + 30);
      for (const [k, n] of m) {
        const pool = new InstancePool(this._geo.get(k)![0], mat, n);
        pool.mesh.frustumCulled = true;
        pool.mesh.boundingSphere = bounds;
        pools.set(k, pool);
        scene.add(pool.mesh);
      }
      this._tiles.set(tile, { cx, cz, pools, lod: 0, hidden: false });
    }
    for (const t of this._trees) this._place(t);
    _game.bus.on('terrain:changed', () => (this._terrainDirty = true));
    _game.bus.on('props:erase', (e) => {
      this._trees = this._trees.filter((t) => {
        if (Math.hypot(t.x - e.x, t.z - e.z) > e.r) return true;
        w.erasedTrees.add(t.id);
        this._pool(t).remove(t.id);
        return false;
      });
    });
  }

  private _place(t: Tree): void {
    const w = this._game.world;
    const c = Math.cos(t.rot);
    const s = Math.sin(t.rot);
    this._m.set(c * t.s, 0, s * t.s, t.x, 0, t.sy, 0, w.heightAt(t.x, t.z) - 0.1, -s * t.s, 0, c * t.s, t.z, 0, 0, 0, 1);
    this._pool(t).set(t.id, this._m, t.color);
  }

  private _pool(t: Tree): InstancePool {
    return this._tiles.get(t.tile)!.pools.get(t.kind)!;
  }

  /** Детализация участков по расстоянию до камеры (с запасом, чтобы не «мигало» на границе). */
  private _updateLod(): void {
    const eye = this._eye();
    for (const tile of this._tiles.values()) {
      const d = Math.hypot(tile.cx - eye.x, tile.cz - eye.z, eye.y * 0.6) - TILE * CELL * 0.5;
      const lod = tile.lod === 0 ? (d > LOD_FAR + 15 ? 1 : 0) : d < LOD_FAR - 15 ? 0 : 1;
      const hidden = d > SMALL_HIDE;
      if (lod === tile.lod && hidden === tile.hidden) continue;
      tile.lod = lod;
      tile.hidden = hidden;
      for (const [k, pool] of tile.pools) {
        pool.mesh.geometry = this._geo.get(k)![lod];
        pool.mesh.visible = this._visible && !(hidden && SMALL.has(k));
      }
    }
  }

  private _blocked(x: number, z: number): boolean {
    const w = this._game.world;
    if (w.graph.clearance(x, z, 6) < 1.8) return true;
    for (const c of w.zones.near(x, z, CELL * 0.8)) if (c.zone || c.building) return true;
    for (const b of w.buildingsNear(x, z, 12)) if (obbDist(w.obbOf(b), { x, z }) < 1.5) return true;
    return false;
  }

  /** После терраформинга: растения перестают «висеть», а в воде исчезают. */
  private _regrow(): void {
    const w = this._game.world;
    this._trees = this._trees.filter((t) => {
      if (w.terrainAt(t.x, t.z) === Terrain.Water) {
        this._pool(t).remove(t.id);
        return false;
      }
      this._place(t);
      return true;
    });
  }

  update(realDt: number): void {
    const w = this._game.world;
    const vis = graphics.get().trees;
    if (vis !== this._visible) {
      this._visible = vis;
      for (const tile of this._tiles.values()) for (const [k, p] of tile.pools) p.mesh.visible = vis && !(tile.hidden && SMALL.has(k));
    }
    this._lodTimer += realDt;
    if (this._lodTimer > 0.25) {
      this._lodTimer = 0;
      this._updateLod();
    }
    if (this._terrainDirty) {
      this._terrainDirty = false;
      this._regrow();
    }
    this._timer += realDt;
    const changed = w.graph.version !== this._graphVersion || w.zones.version !== this._zoneVersion || w.version !== this._worldVersion;
    if (!this._force && (!changed || this._timer < 0.3)) return;
    this._timer = 0;
    this._force = false;
    this._graphVersion = w.graph.version;
    this._zoneVersion = w.zones.version;
    this._worldVersion = w.version;
    this._trees = this._trees.filter((t) => {
      if (!this._blocked(t.x, t.z)) return true;
      this._pool(t).remove(t.id);
      return false;
    });
  }
}
