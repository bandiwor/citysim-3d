import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Размер повторяющегося тайла окон в мировых единицах (2×2 окна). */
export const WINDOW_TILE = 6;
const PLAIN_UV = 0.03;

export interface PartOptions {
  /** повернуть вокруг осей (радианы) до переноса */
  rx?: number;
  ry?: number;
  rz?: number;
  /** нанести текстуру окон на боковые грани */
  windows?: boolean;
  /** мелкая деталь: только в ближней модели (LOD 0) */
  detail?: boolean;
}

/** Уровень детализации, с которым сейчас строятся модели: 0 — вблизи, 1 — издалека. */
let buildLod = 0;

/** Построить модель(и) с заданной детализацией: fn вызывает обычные функции моделей. */
export function withLod<T>(lod: number, fn: () => T): T {
  const prev = buildLod;
  buildLod = lod;
  try {
    return fn();
  } finally {
    buildLod = prev;
  }
}

/** Коробки, общие для нескольких сборщиков одной модели (база + отделка + улучшения): зазоры подбираются с учётом всех. */
let sharedBoxes: BoxRec[] | null = null;

/** Собрать модель из нескольких GeomBuilder так, чтобы их детали не мерцали друг о друга. */
export function shareGaps<T>(fn: () => T): T {
  if (sharedBoxes) return fn();
  sharedBoxes = [];
  try {
    return fn();
  } finally {
    sharedBoxes = null;
  }
}

export function currentLod(): number {
  return buildLod;
}

/** Сегменты круглых деталей: издалека вдвое меньше (но не меньше min). */
const segs = (n: number, min: number): number => (buildLod > 0 ? Math.max(min, Math.round(n / 2)) : n);

interface BoxRec {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  ry: number;
  color: number;
  windows: boolean;
}

const mix = (c: number, k: number): number => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
};
const hash = (a: number, b: number): number => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Собирает процедурную модель из примитивов с вертексными цветами в одну BufferGeometry. */
export class GeomBuilder {
  private _parts: BufferGeometry[] = [];
  private _color = new Color();
  private _m = new Matrix4();
  /** все коробки и основания крыш — для автодеталей ближней модели */
  private _boxes: BoxRec[] = [];
  private _roofs: { x: number; y: number; z: number; w: number; d: number }[] = [];
  private _enrich = true;
  /** счётчик коробок: каждая получает свой микрозазор, чтобы грани соседних деталей не совпадали (иначе мерцают) */
  private _n = 0;

  /** Всё, что добавлено внутри fn, — мелкие детали: только в ближней модели. */
  detailed(fn: (b: this) => void): this {
    if (buildLod === 0) fn(this);
    return this;
  }

  /** Зазор для новой коробки: первый из ряда значений, при котором её грани не лежат в плоскости одноимённых граней других коробок. */
  private _gap(w: number, h: number, d: number, x: number, y: number, z: number, ry: number, tilted: boolean): number {
    const start = this._n++;
    if (tilted) return 0.006 * (1 + ((start * 3) % 11));
    const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.004;
    const over = (a0: number, a1: number, b0: number, b1: number): boolean => Math.min(a1, b1) - Math.max(a0, b0) > 0.01;
    for (let k = 0; k < 11; k++) {
      const e = 0.006 * (1 + (((start + k) * 3) % 11));
      const W = (w + e) / 2;
      const D = (d + e) / 2;
      const top = y + h + e / 2;
      const clash = [...this._boxes, ...(sharedBoxes ?? [])].some((b) => {
        if (Math.abs(b.ry - ry) > 1e-6) return false;
        const bw = b.w / 2;
        const bd = b.d / 2;
        const ox = over(x - W, x + W, b.x - bw, b.x + bw);
        const oz = over(z - D, z + D, b.z - bd, b.z + bd);
        const oy = over(y, top, b.y, b.y + b.h);
        if (ox && oz && near(top, b.y + b.h)) return true;
        if (oy && oz && (near(x - W, b.x - bw) || near(x + W, b.x + bw))) return true;
        if (oy && ox && (near(z - D, b.z - bd) || near(z + D, b.z + bd))) return true;
        return false;
      });
      if (!clash) return e;
    }
    return 0.006 * (1 + ((start * 3) % 11));
  }

  /** Отключить автодетали (для моделей, где они не к месту: машины, деревья, мелкие предметы). */
  plain(): this {
    this._enrich = false;
    return this;
  }

  /** Коробка: x,z — центр, y — низ. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, o: PartOptions = {}): this {
    if (o.detail && buildLod > 0) return this;
    // микрозазор 6…66 мм: подбирается так, чтобы ни одна грань не совпала с гранью уже добавленной детали (иначе мерцает)
    const e = this._gap(w, h, d, x, y, z, o.ry ?? 0, !!(o.rx || o.rz));
    w += e;
    d += e;
    h += e / 2;
    if (!o.rx && !o.rz) this._boxes.push({ w, h, d, x, y, z, ry: o.ry ?? 0, color, windows: !!o.windows });
    const g = new BoxGeometry(w, h, d);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      const side = i < 8 || i >= 16;
      if (o.windows && side) {
        const horiz = i < 8 ? d : w;
        uv.setXY(i, (uv.getX(i) * horiz) / WINDOW_TILE, (uv.getY(i) * h) / WINDOW_TILE);
      } else uv.setXY(i, PLAIN_UV, PLAIN_UV);
    }
    return this._add(g, x, y + h / 2, z, color, o);
  }

  cylinder(rTop: number, rBottom: number, h: number, x: number, y: number, z: number, color: number, seg = 10, o: PartOptions = {}): this {
    if (o.detail && buildLod > 0) return this;
    return this._add(new CylinderGeometry(rTop, rBottom, h, segs(seg, 4)), x, y + h / 2, z, color, o);
  }

  cone(r: number, h: number, x: number, y: number, z: number, color: number, seg = 8, o: PartOptions = {}): this {
    if (o.detail && buildLod > 0) return this;
    return this._add(new ConeGeometry(r, h, segs(seg, 4)), x, y + h / 2, z, color, o);
  }

  sphere(r: number, x: number, y: number, z: number, color: number, o: PartOptions = {}, ws = 10, hs = 8): this {
    if (o.detail && buildLod > 0) return this;
    return this._add(new SphereGeometry(r, segs(ws, 5), segs(hs, 3)), x, y + r, z, color, o);
  }

  /** Двускатная крыша: основание w×d, высота h, конёк вдоль оси X (alongX) либо Z. */
  prism(w: number, d: number, h: number, x: number, y: number, z: number, color: number, alongX = true): this {
    this._roofs.push({ x, y, z, w, d });
    const hx = w / 2;
    const hz = d / 2;
    const P: number[] = [];
    const N: number[] = [];
    const tri = (a: number[], b: number[], c: number[], n: number[]): void => {
      P.push(...a, ...b, ...c);
      N.push(...n, ...n, ...n);
    };
    const sl = Math.hypot(hz, h);
    const nf = [0, hz / sl, h / sl];
    const nb = [0, hz / sl, -h / sl];
    // скаты
    tri([-hx, 0, hz], [hx, 0, hz], [hx, h, 0], nf);
    tri([-hx, 0, hz], [hx, h, 0], [-hx, h, 0], nf);
    tri([hx, 0, -hz], [-hx, 0, -hz], [-hx, h, 0], nb);
    tri([hx, 0, -hz], [-hx, h, 0], [hx, h, 0], nb);
    // торцы
    tri([hx, 0, hz], [hx, 0, -hz], [hx, h, 0], [1, 0, 0]);
    tri([-hx, 0, -hz], [-hx, 0, hz], [-hx, h, 0], [-1, 0, 0]);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new Float32BufferAttribute(new Array((P.length / 3) * 2).fill(PLAIN_UV), 2));
    return this._add(g, x, y, z, color, alongX ? {} : { ry: Math.PI / 2 });
  }

  /** Пирамидальная крыша над прямоугольником w×d. */
  roof(w: number, d: number, h: number, x: number, y: number, z: number, color: number): this {
    this._roofs.push({ x, y, z, w, d });
    const g = new ConeGeometry(0.7071, h, 4);
    g.rotateY(Math.PI / 4);
    g.scale(w, 1, d);
    return this._add(g, x, y + h / 2, z, color, {});
  }

  private _add(g: BufferGeometry, x: number, y: number, z: number, color: number, o: PartOptions): this {
    if (o.rx) g.rotateX(o.rx);
    if (o.ry) g.rotateY(o.ry);
    if (o.rz) g.rotateZ(o.rz);
    g.applyMatrix4(this._m.makeTranslation(x, y, z));
    if (!(g instanceof BoxGeometry) && g.index) {
      const uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, PLAIN_UV, PLAIN_UV);
    }
    if (g.index) {
      const flat = g.toNonIndexed();
      g.dispose();
      g = flat;
    }
    this._color.setHex(color);
    const colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = this._color.r;
      colors[i + 1] = this._color.g;
      colors[i + 2] = this._color.b;
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this._parts.push(g);
    return this;
  }

  /**
   * Автодетали ближней модели для стен с окнами: цоколь, межэтажные карнизы, дверь с козырьком,
   * на плоской крыше — парапет, кондиционеры и вентиляция. Издалека (LOD 1) не строятся.
   */
  private _details(): void {
    const boxes = this._boxes.slice();
    const covers = (a: { x: number; z: number; w: number; d: number }, b: BoxRec): boolean => Math.abs(a.x - b.x) < b.w / 2 && Math.abs(a.z - b.z) < b.d / 2 && a.w >= b.w * 0.6 && a.d >= b.d * 0.6;
    for (const b of boxes) {
      if (!b.windows || b.h < 2.4 || b.w < 1.6 || b.d < 1.6) continue;
      const o = { ry: b.ry };
      const c = Math.cos(b.ry);
      const sn = Math.sin(b.ry);
      // локальное смещение (lx, lz) → мир с учётом поворота коробки
      const at = (lx: number, lz: number): [number, number] => [b.x + lx * c + lz * sn, b.z - lx * sn + lz * c];
      const top = b.y + b.h;
      // цоколь
      if (b.y < 0.6) this.box(b.w + 0.32, Math.min(0.55, b.h * 0.15), b.d + 0.32, b.x, b.y, b.z, 0x8f8a82, o);
      // межэтажные карнизы (у высоток — реже)
      const floors = Math.floor(b.h / 3);
      const every = floors > 12 ? 4 : floors > 4 ? 2 : 1;
      for (let k = every; k < floors; k += every) this.box(b.w + 0.1, 0.13, b.d + 0.1, b.x, b.y + k * 3 - 0.06, b.z, mix(b.color, 0.86), o);
      // угловые пилястры у многоэтажных объёмов: дают рельеф фасаду
      if (b.h >= 6) {
        for (const [lx, lz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as [number, number][]) {
          const [px, pz] = at(lx * (b.w / 2 - 0.07), lz * (b.d / 2 - 0.07));
          this.box(0.36, b.h - 0.1, 0.36, px, b.y + 0.05, pz, mix(b.color, 0.9), o);
        }
      }
      // дверь с козырьком на фасаде (+z)
      if (b.y < 0.6) {
        const [dx, dz] = at(0, b.d / 2 + 0.05);
        this.box(1.05, 2.1, 0.12, dx, b.y + 0.05, dz, 0x5a4636, o);
        const [cx, cz] = at(0, b.d / 2 + 0.35);
        this.box(1.7, 0.12, 0.7, cx, b.y + 2.35, cz, 0x6c7178, o);
      }
      // крыша: скатная (над коробкой есть крыша) — пропускаем; плита сверху — детали на неё
      if (this._roofs.some((r) => Math.abs(r.y - top) < 0.6 && covers(r, b))) continue;
      const slab = boxes.find((s) => s !== b && Math.abs(s.y - top) < 0.05 && s.h <= 1.2 && covers(s, b));
      const ry = slab ? slab.y + slab.h : top;
      const pw = slab ? slab.w : b.w;
      const pd = slab ? slab.d : b.d;
      if (boxes.some((s) => s !== slab && s !== b && Math.abs(s.y - ry) < 0.05 && s.w * s.d > pw * pd * 0.7)) continue;
      // парапет по периметру
      const pc = mix(b.color, 0.8);
      const t = 0.22;
      for (const [lx, lz, w, d] of [[0, pd / 2 - t / 2, pw, t], [0, -pd / 2 + t / 2, pw, t], [pw / 2 - t / 2, 0, t, pd], [-pw / 2 + t / 2, 0, t, pd]] as [number, number, number, number][]) {
        const [px, pz] = at(lx, lz);
        this.box(w, 0.5, d, px, ry, pz, pc, o);
      }
      // кондиционеры и вентиляция — в свободных углах крыши
      if (pw * pd < 14) continue;
      const busy = boxes.filter((s) => Math.abs(s.y - ry) < 0.1);
      const free = (lx: number, lz: number, r: number): boolean => {
        const [wx, wz] = at(lx, lz);
        return !busy.some((s) => Math.abs(s.x - wx) < s.w / 2 + r && Math.abs(s.z - wz) < s.d / 2 + r);
      };
      const n = 1 + Math.floor(hash(b.w * 7 + b.x, b.d * 5 + b.z) * 3);
      const spots: [number, number][] = [[pw / 2 - 1.1, pd / 2 - 1.1], [-pw / 2 + 1.1, -pd / 2 + 1.1], [pw / 2 - 1.1, -pd / 2 + 1.1], [-pw / 2 + 1.1, pd / 2 - 1.1]];
      let placed = 0;
      for (const [lx, lz] of spots) {
        if (placed >= n) break;
        if (!free(lx, lz, 0.8)) continue;
        const [ax, az] = at(lx, lz);
        if (placed % 2 === 0) this.box(1.2, 0.75, 0.9, ax, ry, az, 0xb9bdc2, o).box(0.7, 0.06, 0.7, ax, ry + 0.75, az, 0x55595e, o);
        else this.cylinder(0.28, 0.28, 0.9, ax, ry, az, 0x9da3a9, 8).cylinder(0.4, 0.4, 0.1, ax, ry + 0.9, az, 0x6f747a, 8);
        placed++;
      }
    }
  }

  build(): BufferGeometry {
    if (this._enrich && buildLod === 0) this._details();
    sharedBoxes?.push(...this._boxes);
    this._boxes = [];
    this._roofs = [];
    this._n = 0;
    const merged = mergeGeometries(this._parts, false);
    for (const p of this._parts) p.dispose();
    this._parts = [];
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Сливает готовые геометрии (все с атрибутами position/normal/uv/color) в одну. */
export function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
}
