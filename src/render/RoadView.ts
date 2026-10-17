import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, MeshLambertMaterial, type Scene } from 'three';
import type { Game } from '../core/Game';
import type { RoadEdge } from '../world/RoadGraph';
import { pointAtLength, type Vec2 } from '../world/geometry';
import type { View } from './View';

const ROAD_Y = 0.1;
const CURB = 0.16;
const SIDEWALK = 0xbdb9b0;
const CONCRETE = 0x8d9196;
const BRIDGE_LIFT = 0.3;

type P3 = [number, number, number];

/** Плоскогранные примитивы в один буфер (без индексов). */
class Poly {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  private _c = new Color();

  private _tri(a: P3, b: P3, c: P3, n: P3, color: number): void {
    this._c.setHex(color);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(this._c.r, this._c.g, this._c.b);
    }
  }

  /** четырёхугольник с заданной нормалью */
  quad(a: P3, b: P3, c: P3, d: P3, n: P3, color: number): void {
    this._tri(a, b, c, n, color);
    this._tri(a, c, d, n, color);
  }

  /** лента между двумя ломаными на высоте y */
  strip(l: Vec2[], r: Vec2[], y: number, color: number): void {
    for (let i = 0; i < l.length - 1; i++) {
      this.quad([l[i].x, y, l[i].z], [r[i].x, y, r[i].z], [r[i + 1].x, y, r[i + 1].z], [l[i + 1].x, y, l[i + 1].z], [0, 1, 0], color);
    }
  }

  /** вертикальная стенка вдоль ломаной от y0 до y1; out — единичная нормаль наружу (знак по стороне) */
  wall(line: Vec2[], y0: number, y1: number, side: number, color: number): void {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i];
      const b = line[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      const n: P3 = [(-dz / l) * side, 0, (dx / l) * side];
      this.quad([a.x, y0, a.z], [b.x, y0, b.z], [b.x, y1, b.z], [a.x, y1, a.z], n, color);
    }
  }

  /** ориентированная коробка (низ не рисуется) */
  box(cx: number, cz: number, hw: number, hd: number, rot: number, y0: number, y1: number, color: number): void {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const pt = (u: number, v: number): Vec2 => ({ x: cx + c * u * hw + s * v * hd, z: cz - s * u * hw + c * v * hd });
    const corners = [pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1)];
    this.quad([corners[0].x, y1, corners[0].z], [corners[1].x, y1, corners[1].z], [corners[2].x, y1, corners[2].z], [corners[3].x, y1, corners[3].z], [0, 1, 0], color);
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      this.quad([a.x, y0, a.z], [b.x, y0, b.z], [b.x, y1, b.z], [a.x, y1, a.z], [dz / l, 0, -dx / l], color);
    }
  }

  disc(x: number, z: number, r: number, y: number, color: number, seg = 16): void {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      this._tri([x, y, z], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [0, 1, 0], color);
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Участок ломаной ребра между длинами s0..s1. */
function sub(e: RoadEdge, s0: number, s1: number): Vec2[] {
  const out: Vec2[] = [];
  const a = pointAtLength(e.pts, e.cum, s0);
  out.push({ x: a.x, z: a.z });
  for (let i = 0; i < e.pts.length; i++) if (e.cum[i] > s0 + 0.3 && e.cum[i] < s1 - 0.3) out.push(e.pts[i]);
  const b = pointAtLength(e.pts, e.cum, s1);
  out.push({ x: b.x, z: b.z });
  return out;
}

/** Смещённая ломаная с миттерными нормалями: offset > 0 — вправо по ходу. */
function offsetLine(pts: Vec2[], offset: number): Vec2[] {
  const out: Vec2[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const tx = (b.x - a.x) / l;
    const tz = (b.z - a.z) / l;
    out.push({ x: pts[i].x - tz * offset, z: pts[i].z + tx * offset });
  }
  return out;
}

/** Дороги по графу: лента асфальта, тротуары, разметка, перекрёстки, мосты и остановки одной пересобираемой геометрией. */
export class RoadView implements View {
  private _mesh: Mesh;
  private _version = -1;
  private _stopsDirty = true;

  constructor(scene: Scene, private _game: Game) {
    this._mesh = new Mesh(new BufferGeometry(), new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }));
    this._mesh.receiveShadow = true;
    this._mesh.frustumCulled = false;
    scene.add(this._mesh);
    _game.bus.on('stops:changed', () => (this._stopsDirty = true));
  }

  update(): void {
    const v = this._game.world.graph.version;
    if (v === this._version && !this._stopsDirty) return;
    this._version = v;
    this._stopsDirty = false;
    this._mesh.geometry.dispose();
    this._mesh.geometry = this._build();
  }

  private _build(): BufferGeometry {
    const g = this._game;
    const graph = g.world.graph;
    const p = new Poly();
    const waterY = (e: RoadEdge): number => (e.bridge ? BRIDGE_LIFT : 0);

    for (const e of graph.edges.values()) {
      const type = g.roadTypes.at(e.type);
      const hw = e.hw;
      const sw = type.id === 'highway' ? 0.6 : 1.1;
      const lift = waterY(e);
      const y = ROAD_Y + lift;
      const degA = graph.nodes.get(e.a)!.edges.length;
      const degB = graph.nodes.get(e.b)!.edges.length;
      const trim = hw * 1.15;
      const s0 = degA >= 3 ? trim : 0;
      const s1 = e.len - (degB >= 3 ? trim : 0);
      if (s1 - s0 < 1) continue;
      const line = sub(e, s0, s1);
      const left = offsetLine(line, -(hw - sw));
      const right = offsetLine(line, hw - sw);
      p.strip(left, right, y, type.color);

      // тротуары / ограждения моста
      const top = e.bridge ? y + 0.85 : y + CURB;
      const outL = offsetLine(line, -hw);
      const outR = offsetLine(line, hw);
      const swColor = type.id === 'highway' ? 0x9a9c9f : e.bridge ? 0xa7abb0 : SIDEWALK;
      p.strip(outL, left, top, swColor);
      p.strip(right, outR, top, swColor);
      p.wall(left, y, top, 1, swColor);
      p.wall(right, y, top, -1, swColor);
      if (e.bridge) {
        p.wall(outL, y - 1.6, top, -1, CONCRETE);
        p.wall(outR, y - 1.6, top, 1, CONCRETE);
        for (let s = s0 + 4; s < s1 - 2; s += 12) {
          const c = pointAtLength(e.pts, e.cum, s);
          p.box(c.x, c.z, hw * 0.8, 0.9, Math.atan2(c.tx, c.tz), -4.5, y - 1.6, 0x7c8085);
        }
      }

      // разметка
      const my = y + 0.02;
      const dash = (off: number, color: number, w = 0.12): void => {
        for (let s = s0 + 1.5; s < s1 - 3; s += 8) {
          const a = pointAtLength(e.pts, e.cum, s);
          const b = pointAtLength(e.pts, e.cum, s + 3);
          const l = offsetLine([{ x: a.x, z: a.z }, { x: b.x, z: b.z }], off - w);
          const r = offsetLine([{ x: a.x, z: a.z }, { x: b.x, z: b.z }], off + w);
          p.strip(l, r, my, color);
        }
      };
      if (type.id === 'street') dash(0, 0xd8d8d0);
      else if (type.id === 'avenue') {
        p.strip(offsetLine(line, -0.5), offsetLine(line, 0.5), y + 0.22, 0x5f8a52);
        p.wall(offsetLine(line, -0.5), y, y + 0.22, 1, 0x5f8a52);
        p.wall(offsetLine(line, 0.5), y, y + 0.22, -1, 0x5f8a52);
        dash(hw / 2, 0xd8d8d0, 0.1);
        dash(-hw / 2, 0xd8d8d0, 0.1);
      } else {
        p.strip(offsetLine(line, -0.45), offsetLine(line, -0.2), my, 0xe0b82e);
        p.strip(offsetLine(line, 0.2), offsetLine(line, 0.45), my, 0xe0b82e);
        dash(hw / 2 + 0.5, 0xe4e4e0, 0.1);
        dash(-hw / 2 - 0.5, 0xe4e4e0, 0.1);
      }

      // торец тупика
      for (const [deg, s, at] of [[degA, s0, 0], [degB, s1, 1]] as const) {
        if (deg !== 1) continue;
        const c = pointAtLength(e.pts, e.cum, s);
        p.box(c.x + c.tx * (at ? sw / 2 : -sw / 2), c.z + c.tz * (at ? sw / 2 : -sw / 2), hw, sw / 2, Math.atan2(c.tx, c.tz), y, top, swColor);
      }
    }

    // перекрёстки и изломы
    for (const n of graph.nodes.values()) {
      const edges = n.edges.map((id) => graph.edges.get(id)!);
      const hwMax = Math.max(...edges.map((e) => e.hw));
      const color = g.roadTypes.at(edges[0].type).color;
      const y = ROAD_Y + (edges.some((e) => e.bridge) ? BRIDGE_LIFT : 0);
      if (edges.length >= 3) p.disc(n.x, n.z, hwMax * 1.2, y + 0.003, color);
      else if (edges.length === 2) {
        const dirs = edges.map((e) => {
          const at = e.a === n.id ? 0 : e.len;
          const q = pointAtLength(e.pts, e.cum, at);
          return { x: q.tx * (e.a === n.id ? 1 : -1), z: q.tz * (e.a === n.id ? 1 : -1) };
        });
        const dot = -(dirs[0].x * dirs[1].x + dirs[0].z * dirs[1].z);
        if (dot < 0.995) p.disc(n.x, n.z, hwMax - 0.9, y + 0.003, color);
      }
    }

    // остановки
    for (const s of g.world.stops) {
      const e = graph.edges.get(s.edge);
      if (!e) continue;
      const c = graph.pointAt(e, s.s);
      const rot = Math.atan2(c.tx, c.tz) + Math.PI / 2;
      const y = ROAD_Y + waterY(e);
      const off = e.hw - 0.6;
      const nx = -c.tz;
      const nz = c.tx;
      const at = (a: number, b: number): [number, number] => [c.x + c.tx * a + nx * (off + b), c.z + c.tz * a + nz * (off + b)];
      const box = (a: number, b: number, hwAlong: number, hdAcross: number, y0: number, y1: number, color: number): void => {
        const [x, z] = at(a, b);
        p.box(x, z, hwAlong, hdAcross, rot, y + y0, y + y1, color);
      };
      box(0, 0, 1.5, 0.5, 2.5, 2.7, 0x2f6fb5);
      box(-1.4, 0, 0.06, 0.06, 0.2, 2.5, 0x555b61);
      box(1.4, 0, 0.06, 0.06, 0.2, 2.5, 0x555b61);
      box(0, 0.45, 1.35, 0.05, 0.8, 2.4, 0x9cc4e4);
      box(0, 0.1, 0.9, 0.2, 0.2, 0.6, 0x6b5a45);
      box(2.1, 0, 0.05, 0.05, 0.2, 4, 0x555b61);
      box(2.1, 0, 0.5, 0.05, 3.2, 4, 0x2f6fb5);
    }
    return p.build();
  }
}
