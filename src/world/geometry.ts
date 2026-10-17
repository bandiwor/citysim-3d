export interface Vec2 {
  x: number;
  z: number;
}

/** Ориентированный прямоугольник: центр, полуразмеры и угол рыскания (как в three.js: локальная +Z → (sinθ, cosθ)). */
export interface Obb {
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
}

export const EPS = 1e-9;

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);
export const dist2 = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

export function norm(x: number, z: number): Vec2 {
  const l = Math.hypot(x, z);
  return l < EPS ? { x: 1, z: 0 } : { x: x / l, z: z / l };
}

export interface SegHit {
  /** параметр на первом отрезке 0..1 */
  t: number;
  /** параметр на втором отрезке 0..1 */
  u: number;
  x: number;
  z: number;
}

/** Пересечение отрезков ab и cd (null — параллельны/не пересекаются). */
export function segIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): SegHit | null {
  const rx = b.x - a.x;
  const rz = b.z - a.z;
  const sx = d.x - c.x;
  const sz = d.z - c.z;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < EPS) return null;
  const qx = c.x - a.x;
  const qz = c.z - a.z;
  const t = (qx * sz - qz * sx) / den;
  const u = (qx * rz - qz * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: a.x + rx * t, z: a.z + rz * t };
}

export interface PointSeg {
  d: number;
  t: number;
  x: number;
  z: number;
}

/** Ближайшая точка отрезка ab к точке p. */
export function pointSeg(p: Vec2, a: Vec2, b: Vec2): PointSeg {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  let t = l2 < EPS ? 0 : ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a.x + dx * t;
  const z = a.z + dz * t;
  return { d: Math.hypot(p.x - x, p.z - z), t, x, z };
}

export function cumulative(pts: readonly Vec2[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return cum;
}

export function polyLength(pts: readonly Vec2[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

export interface PolyPoint {
  x: number;
  z: number;
  /** единичная касательная */
  tx: number;
  tz: number;
  /** индекс отрезка */
  seg: number;
}

/** Точка на ломаной на расстоянии s от начала. */
export function pointAtLength(pts: readonly Vec2[], cum: readonly number[], s: number): PolyPoint {
  const n = pts.length;
  const total = cum[n - 1];
  s = s < 0 ? 0 : s > total ? total : s;
  let lo = 0;
  let hi = n - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid + 1] < s) lo = mid + 1;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[lo + 1];
  const segLen = cum[lo + 1] - cum[lo];
  const t = segLen < EPS ? 0 : (s - cum[lo]) / segLen;
  const dir = norm(b.x - a.x, b.z - a.z);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: dir.x, tz: dir.z, seg: lo };
}

export interface PolyProjection extends PolyPoint {
  s: number;
  d: number;
}

/** Проекция точки на ломаную. */
export function projectOnPolyline(pts: readonly Vec2[], cum: readonly number[], p: Vec2): PolyProjection {
  let best: PolyProjection | null = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const r = pointSeg(p, pts[i], pts[i + 1]);
    if (!best || r.d < best.d) {
      const dir = norm(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
      best = { s: cum[i] + r.t * (cum[i + 1] - cum[i]), d: r.d, x: r.x, z: r.z, tx: dir.x, tz: dir.z, seg: i };
    }
  }
  return best!;
}

/** Равномерная передискретизация ломаной с шагом ≈ spacing (концы сохраняются). */
export function resample(pts: readonly Vec2[], spacing: number): Vec2[] {
  const cum = cumulative(pts);
  const total = cum[cum.length - 1];
  const n = Math.max(1, Math.round(total / spacing));
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const p = pointAtLength(pts, cum, (total * i) / n);
    out.push({ x: p.x, z: p.z });
  }
  out[0] = { x: pts[0].x, z: pts[0].z };
  out[n] = { x: pts[pts.length - 1].x, z: pts[pts.length - 1].z };
  return out;
}

/** Квадратичная кривая Безье, сэмплированная с шагом ≈ spacing. */
export function bezier2(p0: Vec2, c: Vec2, p1: Vec2, spacing: number): Vec2[] {
  const rough = 48;
  const pts: Vec2[] = [];
  for (let i = 0; i <= rough; i++) {
    const t = i / rough;
    const u = 1 - t;
    pts.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, z: u * u * p0.z + 2 * u * t * c.z + t * t * p1.z });
  }
  return resample(pts, spacing);
}

// ---------- OBB ----------

export function obbAxes(o: Obb): { ax: Vec2; az: Vec2 } {
  const c = Math.cos(o.rot);
  const s = Math.sin(o.rot);
  return { ax: { x: c, z: -s }, az: { x: s, z: c } };
}

export function obbCorners(o: Obb): Vec2[] {
  const { ax, az } = obbAxes(o);
  const out: Vec2[] = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    out.push({ x: o.x + ax.x * o.hw * sx + az.x * o.hd * sz, z: o.z + ax.z * o.hw * sx + az.z * o.hd * sz });
  }
  return out;
}

/** Расстояние от точки до прямоугольника (0 внутри). */
export function obbDist(o: Obb, p: Vec2): number {
  const { ax, az } = obbAxes(o);
  const dx = p.x - o.x;
  const dz = p.z - o.z;
  const lx = Math.abs(dx * ax.x + dz * ax.z) - o.hw;
  const lz = Math.abs(dx * az.x + dz * az.z) - o.hd;
  return Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
}

export function obbContains(o: Obb, p: Vec2): boolean {
  return obbDist(o, p) === 0;
}

/** Пересечение двух прямоугольников (теорема о разделяющей оси), margin расширяет первый. */
export function obbOverlap(a: Obb, b: Obb, margin = 0): boolean {
  const A = obbAxes(a);
  const B = obbAxes(b);
  const axes = [A.ax, A.az, B.ax, B.az];
  const ca = obbCorners({ ...a, hw: a.hw + margin, hd: a.hd + margin });
  const cb = obbCorners(b);
  for (const ax of axes) {
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;
    for (const p of ca) {
      const d = p.x * ax.x + p.z * ax.z;
      if (d < minA) minA = d;
      if (d > maxA) maxA = d;
    }
    for (const p of cb) {
      const d = p.x * ax.x + p.z * ax.z;
      if (d < minB) minB = d;
      if (d > maxB) maxB = d;
    }
    if (maxA < minB || maxB < minA) return false;
  }
  return true;
}

/** Расстояние от ломаной до прямоугольника (минимум по отрезкам, приблизительно по вершинам и серединам). */
export function polyDistToObb(pts: readonly Vec2[], o: Obb): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) best = Math.min(best, obbDist(o, pts[i]));
  for (let i = 0; i < pts.length - 1; i++) {
    best = Math.min(best, obbDist(o, { x: (pts[i].x + pts[i + 1].x) / 2, z: (pts[i].z + pts[i + 1].z) / 2 }));
  }
  return best;
}

export const yawOf = (dx: number, dz: number): number => Math.atan2(dx, dz);
export const angleBetween = (a: Vec2, b: Vec2): number => {
  const d = (a.x * b.x + a.z * b.z) / (Math.hypot(a.x, a.z) * Math.hypot(b.x, b.z) || 1);
  return Math.acos(Math.max(-1, Math.min(1, d)));
};
