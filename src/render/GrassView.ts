import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3, type Scene } from 'three';
import { CELL } from '../config/constants';
import type { Game } from '../core/Game';
import { obbDist } from '../world/geometry';
import { Terrain } from '../world/Terrain';
import { graphics } from './graphics';
import type { View } from './View';

const UP = new Vector3(0, 1, 0);
const MAX = 90000;

/** Пучок травы: три перекрещенных лезвия, тёмное основание и светлые кончики. */
function tuftGeometry(): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const base = new Color(0.42, 0.64, 0.28);
  const tip = new Color(0.7, 0.88, 0.42);
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    for (const [ox, h, w] of [[-0.35, 0.62, 0.3], [0.3, 0.78, 0.28], [0, 0.5, 0.26]] as [number, number, number][]) {
      const px = cx * ox;
      const pz = cz * ox;
      const a = [px - cx * w, 0, pz - cz * w];
      const b = [px + cx * w, 0, pz + cz * w];
      const c = [px + cx * 0.1, h, pz + cz * 0.1];
      // одно лезвие на обе стороны (DoubleSide; переворот нормали у обратной стороны отключён в шейдере)
      pos.push(...a, ...b, ...c);
      col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  // нормали вверх: трава освещается как земля, а не темнеет на боковых гранях
  g.setAttribute('normal', new Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

const hash = (a: number, b: number): number => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) % 100000) / 100000;
};

/** Трава вокруг камеры: лёгкие пучки с покачиванием на ветру; не растёт на дорогах, зонах и под зданиями. Включается в настройках графики. */
export class GrassView implements View {
  private _mesh: InstancedMesh;
  private _uniform = { value: 0 };
  private _lastX = -1e9;
  private _lastZ = -1e9;
  private _lastR = 0;
  private _lastLevel = -1;
  private _versions = '';
  private _timer = 0;
  private _occ = new Map<number, boolean>();
  /** готовые пучки клетки (матрицы, цвета, порог появления по возрастанию): при сдвиге камеры только копируются */
  private _cells = new Map<number, { mat: Float32Array; col: Float32Array; keys: Float32Array }>();
  private _per = 0;
  private _dirty = true;
  private _t = 0;
  private _m = new Matrix4();
  private _q = new Quaternion();
  private _p = new Vector3();
  private _s = new Vector3();
  private _c = new Color();

  constructor(scene: Scene, private _game: Game, private _focus: () => { x: number; z: number; distance: number }) {
    const mat = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
    mat.onBeforeCompile = (sh) => {
      // нормаль «вверх» одинакова для обеих сторон лезвия: не переворачиваем её у обратной стороны, иначе трава чернеет
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize( vNormal );');
      sh.uniforms.uTime = this._uniform;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\n  float sw = sin(uTime * 1.7 + instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23);\n  transformed.x += sw * 0.16 * position.y * position.y;\n  transformed.z += cos(uTime * 1.3 + instanceMatrix[3].z * 0.31) * 0.1 * position.y * position.y;\n#endif');
    };
    this._mesh = new InstancedMesh(tuftGeometry(), mat, MAX);
    this._mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
    this._mesh.count = 0;
    this._mesh.frustumCulled = false;
    this._mesh.receiveShadow = false;
    this._mesh.castShadow = false;
    scene.add(this._mesh);
    _game.bus.on('terrain:changed', () => {
      this._dirty = true;
      this._cells.clear();
    });
    graphics.onChange(() => (this._dirty = true));
  }

  private _occupied(ci: number, cx: number, cz: number): boolean {
    let o = this._occ.get(ci);
    if (o !== undefined) return o;
    const w = this._game.world;
    o = w.graph.clearance(cx, cz, 6) < CELL * 0.72;
    if (!o) for (const c of w.zones.near(cx, cz, CELL * 0.75)) if (c.zone || c.building) o = true;
    if (!o) for (const b of w.buildingsNear(cx, cz, 14)) if (obbDist(w.obbOf(b), { x: cx, z: cz }) < CELL * 0.6) o = true;
    this._occ.set(ci, o);
    return o;
  }

  /** Берег (рядом вода): там песок, трава не растёт. */
  private _shore(x: number, y: number): boolean {
    const w = this._game.world;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (w.terrain[Math.min(w.size - 1, Math.max(0, y + dy)) * w.size + Math.min(w.size - 1, Math.max(0, x + dx))] === Terrain.Water) return true;
    return false;
  }

  /** Пучки одной клетки (пусто — трава здесь не растёт); считаются один раз и кэшируются. */
  private _cell(idx: number, x: number, y: number, per: number): { mat: Float32Array; col: Float32Array; keys: Float32Array } {
    const cached = this._cells.get(idx);
    if (cached) return cached;
    const w = this._game.world;
    const cx = (x + 0.5) * CELL;
    const cz = (y + 0.5) * CELL;
    const empty = w.terrain[idx] === Terrain.Water || this._shore(x, y) || w.heightAt(cx, cz) > 16 || this._occupied(idx, cx, cz);
    const order = empty ? [] : Array.from({ length: per }, (_, n) => n).sort((a, b) => hash(idx, a + 77) - hash(idx, b + 77));
    const mat = new Float32Array(order.length * 16);
    const col = new Float32Array(order.length * 3);
    const keys = new Float32Array(order.length);
    order.forEach((n, i) => {
      const px = (x + hash(idx, n * 3 + 1)) * CELL;
      const pz = (y + hash(idx, n * 3 + 2)) * CELL;
      const s = 0.26 + hash(idx, n + 500) * 0.26;
      this._m.compose(this._p.set(px, w.heightAt(px, pz) - 0.05, pz), this._q.setFromAxisAngle(UP, hash(idx, n + 900) * 6.28), this._s.set(s, s * (0.9 + hash(idx, n + 1300) * 0.6), s));
      this._m.toArray(mat, i * 16);
      const shade = 0.92 + hash(idx, n + 1700) * 0.18;
      this._c.setRGB(shade, shade * (0.95 + hash(idx, n + 2100) * 0.15), shade * 0.9).toArray(col, i * 3);
      keys[i] = hash(idx, n + 77);
    });
    const res = { mat, col, keys };
    this._cells.set(idx, res);
    return res;
  }

  update(realDt: number): void {
    this._t += realDt;
    this._uniform.value = this._t;
    const level = graphics.get().grass;
    const f = this._focus();
    const w = this._game.world;
    if (level === 0 || f.distance > 170) {
      this._mesh.count = 0;
      this._lastLevel = level;
      this._dirty = true;
      return;
    }
    this._timer += realDt;
    const versions = `${w.graph.version}|${w.zones.version}|${w.version}`;
    const r = Math.round(Math.min(26, Math.max(10, f.distance / 8)));
    const moved = Math.hypot(f.x - this._lastX, f.z - this._lastZ) > CELL * 2 || Math.abs(r - this._lastR) > 3;
    if (!this._dirty && !moved && versions === this._versions && level === this._lastLevel) return;
    if (this._timer < 0.2) return;
    this._timer = 0;
    if (versions !== this._versions) {
      this._occ.clear();
      this._cells.clear();
    }
    this._versions = versions;
    this._lastX = f.x;
    this._lastZ = f.z;
    this._lastR = r;
    this._lastLevel = level;
    this._dirty = false;

    const per = level === 2 ? 26 : 12;
    if (per !== this._per || this._cells.size > 9000) this._cells.clear();
    this._per = per;
    const ci = Math.floor(f.x / CELL);
    const cj = Math.floor(f.z / CELL);
    const mats = this._mesh.instanceMatrix.array as Float32Array;
    const cols = this._mesh.instanceColor!.array as Float32Array;
    let k = 0;
    for (let dj = -r; dj <= r && k < MAX; dj++) {
      for (let di = -r; di <= r && k < MAX; di++) {
        if (di * di + dj * dj > r * r) continue;
        const x = ci + di;
        const y = cj + dj;
        if (x < 0 || y < 0 || x >= w.size || y >= w.size) continue;
        const cell = this._cell(y * w.size + x, x, y, per);
        // к краю круга трава редеет: берём первые пучки с наименьшим порогом
        const limit = Math.min(1, (1 - Math.hypot(di, dj) / r) * 3);
        let n = 0;
        while (n < cell.keys.length && cell.keys[n] <= limit) n++;
        n = Math.min(n, MAX - k);
        if (!n) continue;
        mats.set(cell.mat.subarray(0, n * 16), k * 16);
        cols.set(cell.col.subarray(0, n * 3), k * 3);
        k += n;
      }
    }
    this._mesh.count = k;
    this._mesh.instanceMatrix.needsUpdate = true;
    if (this._mesh.instanceColor) this._mesh.instanceColor.needsUpdate = true;
  }
}
