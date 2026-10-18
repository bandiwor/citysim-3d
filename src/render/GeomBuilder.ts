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
}

/** Собирает процедурную модель из примитивов с вертексными цветами в одну BufferGeometry. */
export class GeomBuilder {
  private _parts: BufferGeometry[] = [];
  private _color = new Color();
  private _m = new Matrix4();

  /** Коробка: x,z — центр, y — низ. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, o: PartOptions = {}): this {
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
    return this._add(new CylinderGeometry(rTop, rBottom, h, seg), x, y + h / 2, z, color, o);
  }

  cone(r: number, h: number, x: number, y: number, z: number, color: number, seg = 8, o: PartOptions = {}): this {
    return this._add(new ConeGeometry(r, h, seg), x, y + h / 2, z, color, o);
  }

  sphere(r: number, x: number, y: number, z: number, color: number, o: PartOptions = {}, ws = 10, hs = 8): this {
    return this._add(new SphereGeometry(r, ws, hs), x, y + r, z, color, o);
  }

  /** Двускатная крыша: основание w×d, высота h, конёк вдоль оси X (alongX) либо Z. */
  prism(w: number, d: number, h: number, x: number, y: number, z: number, color: number, alongX = true): this {
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

  build(): BufferGeometry {
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
