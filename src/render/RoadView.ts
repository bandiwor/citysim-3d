import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, MeshLambertMaterial, type Scene } from 'three';
import type { Game } from '../core/Game';
import type { RoadEdge, RoadGraph, RoadNode } from '../world/RoadGraph';
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


interface Arm {
  e: RoadEdge;
  /** единичный вектор от узла вдоль ребра */
  tx: number;
  tz: number;
  /** левая нормаль (поворот на +90°) */
  nx: number;
  nz: number;
  hw: number;
  inner: number;
  /** на каком расстоянии от узла ребро обрезается под перекрёсток */
  cut: number;
  /** ребро начинается в этом узле */
  atStart: boolean;
}

interface Corner {
  /** внутренняя (кромка асфальта) и внешняя (край тротуара) точки, смещения от узла */
  ix: number;
  iz: number;
  ox: number;
  oz: number;
}

interface JunctionGeo {
  arms: Arm[];
  /** угол между лучом k и k+1 (против часовой); null — лучи не сходятся острым углом */
  corners: (Corner | null)[];
}

/** Пересечение боковых линий соседних лучей: (a, b) — расстояния вдоль лучей i и j от узла. */
function cornerOf(i: Arm, j: Arm, offI: number, offJ: number): { a: number; b: number } | null {
  const cross = i.tx * j.tz - i.tz * j.tx;
  // почти противоположные лучи: боковые линии параллельны, угла нет
  if (Math.abs(cross) < 0.08) return null;
  const rx = -offJ * j.nx - offI * i.nx;
  const rz = -offJ * j.nz - offI * i.nz;
  const det = -cross;
  return { a: (-rx * j.tz + j.tx * rz) / det, b: (i.tx * rz - i.tz * rx) / det };
}

/** Строит «звезду» перекрытия: обрезка лучей и угловые точки, чтобы между дорогами не оставалось щелей. */
function type3(g: Game, e: RoadEdge): number {
  const t = g.roadTypes.at(e.type);
  return t.median === 'barrier' ? 0x9a9c9f : e.bridge ? 0xa7abb0 : SIDEWALK;
}

function junctionGeo(graph: RoadGraph, n: RoadNode, innerOf: (e: RoadEdge) => number): JunctionGeo | null {
  const edges = n.edges.map((id) => graph.edges.get(id)).filter((e): e is RoadEdge => !!e);
  const arms: Arm[] = edges.map((e) => {
    const atStart = e.a === n.id;
    const q = pointAtLength(e.pts, e.cum, atStart ? 0 : e.len);
    const k = atStart ? 1 : -1;
    return { e, tx: q.tx * k, tz: q.tz * k, nx: -q.tz * k, nz: q.tx * k, hw: e.hw, inner: innerOf(e), cut: e.hw * 1.15, atStart };
  });
  if (arms.length < 2) return null;
  arms.sort((p, q) => Math.atan2(p.tz, p.tx) - Math.atan2(q.tz, q.tx));
  if (arms.length === 2 && -(arms[0].tx * arms[1].tx + arms[0].tz * arms[1].tz) > 0.985) return null;
  const maxA = Math.max(...arms.map((a) => a.hw)) * 4;
  const m = arms.length;
  const pairs: ({ a: number; b: number } | null)[] = [];
  for (let k = 0; k < m; k++) {
    const i = arms[k];
    const j = arms[(k + 1) % m];
    const c = cornerOf(i, j, i.hw, j.hw);
    const ok = c && Math.abs(c.a) < maxA && Math.abs(c.b) < maxA ? c : null;
    pairs.push(ok);
    if (ok) {
      if (ok.a > 0) i.cut = Math.max(i.cut, ok.a + 0.3);
      if (ok.b > 0) j.cut = Math.max(j.cut, ok.b + 0.3);
    }
  }
  for (const a of arms) a.cut = Math.min(a.cut, a.e.len * 0.45);
  const corners = pairs.map((ok, k): Corner | null => {
    if (!ok) return null;
    const i = arms[k];
    const j = arms[(k + 1) % m];
    const ci = cornerOf(i, j, i.inner, j.inner);
    if (!ci) return null;
    return {
      ox: ok.a * i.tx + i.hw * i.nx,
      oz: ok.a * i.tz + i.hw * i.nz,
      ix: ci.a * i.tx + i.inner * i.nx,
      iz: ci.a * i.tz + i.inner * i.nz,
    };
  });
  return { arms, corners };
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

    // перекрёстки: обрезка лучей и угловые точки (до рисования самих дорог)
    const innerOf = (e: RoadEdge): number => e.hw - g.roadTypes.at(e.type).sidewalk;
    const cuts = new Map<string, number>();
    const geos = new Map<number, JunctionGeo>();
    for (const n of graph.nodes.values()) {
      const geo = n.edges.length >= 2 ? junctionGeo(graph, n, innerOf) : null;
      if (!geo) continue;
      geos.set(n.id, geo);
      for (const a of geo.arms) cuts.set(`${a.e.id}:${a.atStart ? 'a' : 'b'}`, a.cut);
    }

    for (const e of graph.edges.values()) {
      const type = g.roadTypes.at(e.type);
      const hw = e.hw;
      const sw = type.sidewalk;
      const lift = waterY(e);
      const y = ROAD_Y + lift;
      const degA = graph.nodes.get(e.a)!.edges.length;
      const degB = graph.nodes.get(e.b)!.edges.length;
      const s0 = cuts.get(`${e.id}:a`) ?? 0;
      const s1 = e.len - (cuts.get(`${e.id}:b`) ?? 0);
      if (s1 - s0 < 1) continue;
      const line = sub(e, s0, s1);
      const inner = hw - sw;
      const left = offsetLine(line, -inner);
      const right = offsetLine(line, inner);
      p.strip(left, right, y, type.color);

      // тротуары / ограждения моста (у дороги без тротуара — только обочина земли)
      const top = e.bridge ? y + 0.85 : y + CURB;
      const outL = offsetLine(line, -hw);
      const outR = offsetLine(line, hw);
      const swColor = type.median === 'barrier' ? 0x9a9c9f : e.bridge ? 0xa7abb0 : SIDEWALK;
      if (sw > 0) {
        p.strip(outL, left, top, swColor);
        p.strip(right, outR, top, swColor);
        p.wall(left, y, top, 1, swColor);
        p.wall(right, y, top, -1, swColor);
      } else if (e.bridge) {
        p.wall(outL, y, top, 1, 0xa7abb0);
        p.wall(outR, y, top, -1, 0xa7abb0);
      } else {
        const verge = 0x8a8068;
        p.strip(offsetLine(line, -hw - 0.7), outL, y - 0.02, verge);
        p.strip(outR, offsetLine(line, hw + 0.7), y - 0.02, verge);
      }
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
      const mid = type.median;
      if (mid === 'grass' || mid === 'trees') {
        const mw = mid === 'trees' ? 1.4 : 0.5;
        const col = mid === 'trees' ? 0x57884a : 0x5f8a52;
        p.strip(offsetLine(line, -mw), offsetLine(line, mw), y + 0.22, col);
        p.wall(offsetLine(line, -mw), y, y + 0.22, 1, col);
        p.wall(offsetLine(line, mw), y, y + 0.22, -1, col);
        if (mid === 'trees') {
          for (let s = s0 + 3; s < s1 - 2; s += 9) {
            const c = pointAtLength(e.pts, e.cum, s);
            p.box(c.x, c.z, 0.18, 0.18, 0, y + 0.2, y + 1.8, 0x6e4a2c);
            p.box(c.x, c.z, 1.1, 1.1, Math.atan2(c.tx, c.tz), y + 1.6, y + 3.3, 0x3f8a46);
          }
        }
      }
      if (mid === 'barrier') {
        p.strip(offsetLine(line, -0.45), offsetLine(line, 0.45), y + 0.5, 0x9c9fa3);
        p.wall(offsetLine(line, -0.45), y, y + 0.5, 1, 0x9c9fa3);
        p.wall(offsetLine(line, 0.45), y, y + 0.5, -1, 0x9c9fa3);
      }
      const lanes = type.lanes;
      if (type.marking === 'dash' && !type.oneway) {
        if (mid === 'none') dash(0, type.id === 'country' ? 0xe6d27a : 0xd8d8d0);
        else for (let k = 1; k < lanes; k++) {
          const off = (inner / lanes) * k + (mid === 'trees' ? 0.9 : 0);
          dash(off, 0xd8d8d0, 0.1);
          dash(-off, 0xd8d8d0, 0.1);
        }
      } else if (type.marking === 'double') {
        p.strip(offsetLine(line, -0.45), offsetLine(line, -0.2), my, 0xe0b82e);
        p.strip(offsetLine(line, 0.2), offsetLine(line, 0.45), my, 0xe0b82e);
        dash(hw / 2 + 0.5, 0xe4e4e0, 0.1);
        dash(-hw / 2 - 0.5, 0xe4e4e0, 0.1);
      } else if (type.oneway) {
        // стрелки направления
        for (let s = s0 + 5; s < s1 - 3; s += 14) {
          const c = pointAtLength(e.pts, e.cum, s);
          const rot = Math.atan2(c.tx, c.tz);
          const nx = -c.tz;
          const nz = c.tx;
          p.box(c.x, c.z, 0.16, 1.1, rot, my, my + 0.01, 0xe8e8e0);
          const tipX = c.x + c.tx * 1.2;
          const tipZ = c.z + c.tz * 1.2;
          for (const sign of [-1, 1]) {
            const dx = -c.tx * Math.cos(0.7) + nx * sign * Math.sin(0.7);
            const dz = -c.tz * Math.cos(0.7) + nz * sign * Math.sin(0.7);
            p.box(tipX + dx * 0.4, tipZ + dz * 0.4, 0.13, 0.42, Math.atan2(dx, dz), my, my + 0.01, 0xe8e8e0);
          }
        }
      }

      // торец тупика
      for (const [deg, s, at] of [[degA, s0, 0], [degB, s1, 1]] as const) {
        if (deg !== 1 || sw <= 0) continue;
        const c = pointAtLength(e.pts, e.cum, s);
        p.box(c.x + c.tx * (at ? sw / 2 : -sw / 2), c.z + c.tz * (at ? sw / 2 : -sw / 2), hw, sw / 2, Math.atan2(c.tx, c.tz), y, top, swColor);
      }
    }

    // перекрёстки и изломы: асфальт веером от центра + тротуарные уголки в промежутках между лучами
    for (const [id, geo] of geos) {
      const n = graph.nodes.get(id)!;
      const edges = geo.arms.map((a) => a.e);
      const color = g.roadTypes.at(edges.reduce((best, e) => (e.hw > best.hw ? e : best), edges[0]).type).color;
      const lift = edges.some((e) => e.bridge) ? BRIDGE_LIFT : 0;
      const y = ROAD_Y + lift;
      const top = edges.some((e) => e.bridge) ? y + 0.85 : y + CURB;
      const m = geo.arms.length;
      // контур асфальта: для каждого луча — две точки на линии обрезки, затем угол к следующему лучу
      const ring: Vec2[] = [];
      geo.arms.forEach((a, k) => {
        ring.push({ x: a.cut * a.tx - a.inner * a.nx, z: a.cut * a.tz - a.inner * a.nz });
        ring.push({ x: a.cut * a.tx + a.inner * a.nx, z: a.cut * a.tz + a.inner * a.nz });
        const c = geo.corners[k];
        if (c) ring.push({ x: c.ix, z: c.iz });
      });
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k];
        const b = ring[(k + 1) % ring.length];
        // порядок вершин против часовой стрелки сверху (нормаль вверх)
        p.quad([n.x, y + 0.003, n.z], [n.x + b.x, y + 0.003, n.z + b.z], [n.x + b.x, y + 0.003, n.z + b.z], [n.x + a.x, y + 0.003, n.z + a.z], [0, 1, 0], color);
      }
      // тротуарные уголки
      geo.arms.forEach((a, k) => {
        const c = geo.corners[k];
        const b = geo.arms[(k + 1) % m];
        if (a.hw - a.inner <= 0 || b.hw - b.inner <= 0) return;
        const sw = type3(g, a.e);
        if (!c) {
          // почти противоположные лучи (сквозная дорога у примыкания): сплошной тротуар между ними
          if (a.tx * b.tx + a.tz * b.tz < -0.9) {
            const A = { x: n.x + a.cut * a.tx + a.inner * a.nx, z: n.z + a.cut * a.tz + a.inner * a.nz };
            const Ao = { x: n.x + a.cut * a.tx + a.hw * a.nx, z: n.z + a.cut * a.tz + a.hw * a.nz };
            const B = { x: n.x + b.cut * b.tx - b.inner * b.nx, z: n.z + b.cut * b.tz - b.inner * b.nz };
            const Bo = { x: n.x + b.cut * b.tx - b.hw * b.nx, z: n.z + b.cut * b.tz - b.hw * b.nz };
            p.quad([A.x, top, A.z], [B.x, top, B.z], [Bo.x, top, Bo.z], [Ao.x, top, Ao.z], [0, 1, 0], sw);
            p.wall([A, B], y, top, -1, sw);
          }
          return;
        }
        const A = { x: n.x + a.cut * a.tx + a.inner * a.nx, z: n.z + a.cut * a.tz + a.inner * a.nz };
        const Ao = { x: n.x + a.cut * a.tx + a.hw * a.nx, z: n.z + a.cut * a.tz + a.hw * a.nz };
        const B = { x: n.x + b.cut * b.tx - b.inner * b.nx, z: n.z + b.cut * b.tz - b.inner * b.nz };
        const Bo = { x: n.x + b.cut * b.tx - b.hw * b.nx, z: n.z + b.cut * b.tz - b.hw * b.nz };
        const Ci = { x: n.x + c.ix, z: n.z + c.iz };
        const Co = { x: n.x + c.ox, z: n.z + c.oz };
        p.quad([A.x, top, A.z], [Ci.x, top, Ci.z], [Co.x, top, Co.z], [Ao.x, top, Ao.z], [0, 1, 0], sw);
        p.quad([Ci.x, top, Ci.z], [B.x, top, B.z], [Bo.x, top, Bo.z], [Co.x, top, Co.z], [0, 1, 0], sw);
        p.wall([A, Ci, B], y, top, -1, sw);
      });
      void n;
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
