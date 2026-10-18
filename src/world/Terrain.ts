import type { GameConfig } from '../config/gameConfig';
import { Rng, smoothstep } from '../core/Rng';
import { Noise } from './Noise';

/** Класс клетки по рельефу. Land — застройка; Water — вода/берег (только мосты); Blocked — холмы/горы. */
export const Terrain = { Land: 0, Water: 1, Blocked: 2 } as const;

export interface TerrainData {
  size: number;
  heights: Float32Array;
  terrain: Uint8Array;
}

export interface TerrainParams {
  size: number;
  seed: number;
  waterLevel: number;
  flatEpsilon: number;
  terrain: GameConfig['terrain'];
  /** стиль ландшафта; нет — старый генератор (для сохранений прежних версий) */
  style?: TerrainStyle;
}

/** Стиль ландшафта: уровни 0..3 (нет / чуть / средне / много). */
export interface TerrainStyle {
  /** горные массивы */
  mountains: number;
  /** холмистые местности */
  hills: number;
  /** реки: 0 нет, 1 ручьи, 2 большая река, 3 большая река с притоками */
  rivers: number;
  /** озёра 0..2 */
  lakes: number;
}

export const STYLE_PRESETS: Record<string, TerrainStyle> = {
  balanced: { mountains: 1, hills: 2, rivers: 2, lakes: 1 },
  plains: { mountains: 0, hills: 0, rivers: 1, lakes: 1 },
  hilly: { mountains: 0, hills: 3, rivers: 1, lakes: 1 },
  mountains: { mountains: 3, hills: 2, rivers: 1, lakes: 0 },
  river: { mountains: 1, hills: 1, rivers: 3, lakes: 1 },
  lakes: { mountains: 0, hills: 1, rivers: 1, lakes: 2 },
};

/** Стиль по seed: «случайный» пресет с вариациями. */
export function randomStyle(seed: number): TerrainStyle {
  const r = new Rng(seed ^ 0x51ed270b);
  return { mountains: r.int(0, 3), hills: r.int(0, 3), rivers: r.int(0, 3), lakes: r.int(0, 2) };
}

export const terrainParams = (cfg: GameConfig, seed: number, size = cfg.world.size, style?: TerrainStyle): TerrainParams => ({
  style,
  size,
  seed,
  waterLevel: cfg.world.waterLevel,
  flatEpsilon: cfg.world.flatEpsilon,
  terrain: cfg.terrain,
});

/** Ровная карта целиком под застройку (для тестов и песочницы). */
export function flatTerrain(size: number): TerrainData {
  return { size, heights: new Float32Array((size + 1) * (size + 1)), terrain: new Uint8Array(size * size) };
}

/**
 * Рельеф: плоская застраиваемая равнина (высота ровно 0) + река, озеро, холмы и горное кольцо по краям.
 * Чистая функция — безопасно выполняется в воркере.
 */
export function generateTerrain(p: TerrainParams): TerrainData {
  return p.style ? generateStyledTerrain(p, p.style) : generateLegacyTerrain(p);
}

function generateLegacyTerrain(p: TerrainParams): TerrainData {
  const n = p.size;
  const c = p.terrain;
  const heights = new Float32Array((n + 1) * (n + 1));
  const terrain = new Uint8Array(n * n);
  const noise = new Noise(p.seed);
  const noise2 = new Noise(p.seed ^ 0x9e3779b9);
  const phase = (p.seed % 628) / 100;
  const cx = n / 2;
  const lakeX = n * (0.72 + 0.08 * noise.noise(1.3, 2.1));
  const lakeY = n * (0.68 + 0.08 * noise.noise(4.1, 7.7));
  const lakeR = n * c.lakeRadius;

  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const edge = Math.min(i, j, n - i, n - j);
      const dc = Math.hypot(i - cx, j - cx);
      const hillMask = smoothstep(c.flatCenterNear, c.flatCenterFar, dc);
      let h = Math.max(0, noise.fbm(i * c.hillFrequency + 10, j * c.hillFrequency + 10, 4) - c.hillThreshold) * c.hillHeight * hillMask;
      const ring = smoothstep(c.ringWidth, 0, edge);
      h += ring * ring * (c.ringBase + c.ringNoise * Math.abs(noise2.fbm(i * 0.08, j * 0.08, 3)) + c.ringExtra * ring);

      const rx = n * 0.3 + Math.sin(j * 0.075 + phase) * n * c.riverAmplitude + noise.noise(j * 0.05, 3.3) * n * 0.05;
      const rd = Math.abs(i - rx);
      const river = smoothstep(c.riverWidth, c.riverCore, rd) * (1 - smoothstep(0.55, 0.95, ring));
      const ld = Math.hypot(i - lakeX, j - lakeY) / (lakeR * (1 + 0.35 * noise2.noise(i * 0.12, j * 0.12)));
      const lake = smoothstep(1.35, 0.55, ld) * (1 - ring);

      const water = Math.max(river, lake);
      if (water > 0 && h < 1) h = 0;
      h -= water * c.waterDepth;
      if (Math.abs(h) < 0.04) h = 0;
      heights[j * (n + 1) + i] = h;
    }
  }

  classifyTerrain(heights, terrain, n, p.flatEpsilon);
  return { size: n, heights, terrain };
}

/** Класс клетки по высотам её четырёх вершин. Можно обновить только прямоугольник клеток. */
export function classifyTerrain(heights: Float32Array, terrain: Uint8Array, n: number, eps: number, x0 = 0, y0 = 0, x1 = n - 1, y1 = n - 1): void {
  for (let y = Math.max(0, y0); y <= Math.min(n - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(n - 1, x1); x++) {
      let min = Infinity;
      let max = -Infinity;
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const h = heights[(y + dy) * (n + 1) + x + dx];
          if (h < min) min = h;
          if (h > max) max = h;
        }
      }
      let t: number = Terrain.Land;
      if (max > eps) t = Terrain.Blocked;
      else if (min < -eps) t = Terrain.Water;
      terrain[y * n + x] = t;
    }
  }
}

interface Massif {
  x: number;
  y: number;
  r: number;
  h: number;
  ang: number;
  elong: number;
}

/** Расстояние от точки до ломаной (вершины в клетках). */
function distToPolyline(px: number, py: number, pts: { x: number; y: number }[]): { d: number; t: number } {
  let best = Infinity;
  let bt = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2));
    const d = Math.hypot(px - (a.x + dx * u), py - (a.y + dy * u));
    if (d < best) {
      best = d;
      bt = (k + u) / (pts.length - 1);
    }
  }
  return { d: best, t: bt };
}

/**
 * Новый ландшафт: плоская застраиваемая равнина в центре (высота ровно 0) и набор природных элементов по стилю:
 * горные массивы (если на карте хватает места), холмистые местности, ручьи, большие реки с притоками, озёра.
 * Чистая функция — безопасно выполняется в воркере.
 */
function generateStyledTerrain(p: TerrainParams, s: TerrainStyle): TerrainData {
  const n = p.size;
  const c = p.terrain;
  const heights = new Float32Array((n + 1) * (n + 1));
  const terrain = new Uint8Array(n * n);
  const rng = new Rng(p.seed * 7919 + 13);
  const noise = new Noise(p.seed);
  const noise2 = new Noise(p.seed ^ 0x9e3779b9);
  const cx = n / 2;

  // горные массивы: в стороне от центра, не пересекаются; сколько поместится
  const wantMassifs = [0, 1 + (rng.next() < 0.4 ? 1 : 0), 3, 5][s.mountains] ?? 0;
  const massifs: Massif[] = [];
  for (let attempt = 0; attempt < 80 && massifs.length < wantMassifs; attempt++) {
    const ang = rng.next() * Math.PI * 2;
    const dist = n * rng.range(0.3, 0.47);
    const r = n * rng.range(0.1, 0.19);
    const m: Massif = { x: cx + Math.cos(ang) * dist, y: cx + Math.sin(ang) * dist, r, h: rng.range(34, 68), ang: rng.next() * Math.PI, elong: rng.range(1, 1.7) };
    if (dist - r < n * 0.2) continue;
    if (massifs.some((o) => Math.hypot(o.x - m.x, o.y - m.y) < (o.r + m.r) * 0.8)) continue;
    massifs.push(m);
  }

  // реки: от края к краю с изгибами; притоки впадают в главную
  const rivers: { pts: { x: number; y: number }[]; w: number }[] = [];
  const riverPath = (a: { x: number; y: number }, b: { x: number; y: number }, w: number, bend: number): void => {
    const pts: { x: number; y: number }[] = [];
    const steps = 48;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const ph = rng.next() * 6.28;
    const fr = rng.range(1.5, 3.2);
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const off = (Math.sin(u * Math.PI * fr + ph) * bend + noise.noise(u * 4 + a.x * 0.1, 7.7) * bend * 0.8) * Math.sin(Math.min(1, u * 6) * 1.57);
      pts.push({ x: a.x + dx * u + nx * off, y: a.y + dy * u + ny * off });
    }
    rivers.push({ pts, w });
  };
  const edgePoint = (side: number, along: number): { x: number; y: number } => (side === 0 ? { x: along * n, y: 0 } : side === 1 ? { x: n, y: along * n } : side === 2 ? { x: along * n, y: n } : { x: 0, y: along * n });
  if (s.rivers >= 1) {
    const side = rng.int(0, 3);
    const a = edgePoint(side, rng.range(0.15, 0.85));
    const b = edgePoint((side + 2) % 4, rng.range(0.15, 0.85));
    if (s.rivers === 1) {
      riverPath(a, b, n * 0.012 + 0.9, n * 0.07);
      if (rng.next() < 0.6) {
        const s2 = (side + 1) % 4;
        riverPath(edgePoint(s2, rng.range(0.2, 0.8)), edgePoint((s2 + 2) % 4, rng.range(0.2, 0.8)), n * 0.01 + 0.8, n * 0.06);
      }
    } else {
      const w = n * 0.026 + 1.8;
      riverPath(a, b, w, n * 0.09);
      if (s.rivers === 3) {
        const main = rivers[0].pts;
        for (let k = 0; k < 2; k++) {
          const joinAt = main[Math.floor(rng.range(0.25, 0.75) * (main.length - 1))];
          const side2 = rng.int(0, 3);
          riverPath(edgePoint(side2, rng.range(0.1, 0.9)), joinAt, n * 0.012 + 0.9, n * 0.05);
        }
      }
    }
  }

  // озёра
  const lakes: { x: number; y: number; r: number }[] = [];
  for (let attempt = 0; attempt < 40 && lakes.length < s.lakes; attempt++) {
    const r = n * rng.range(0.055, 0.1);
    const x = n * rng.range(0.15, 0.85);
    const y = n * rng.range(0.15, 0.85);
    if (massifs.some((m) => Math.hypot(m.x - x, m.y - y) < m.r + r)) continue;
    if (lakes.some((l) => Math.hypot(l.x - x, l.y - y) < l.r + r + 4)) continue;
    lakes.push({ x, y, r });
  }

  const hillThr = [9, 0.2, 0.08, -0.04][s.hills] ?? 9;
  const hillGain = [0, 20, 26, 32][s.hills] ?? 0;
  const rimWidth = Math.max(5, n * 0.07);
  const rimAmp = s.mountains > 0 || s.hills > 1 ? 1 : 0.55;

  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const edge = Math.min(i, j, n - i, n - j);
      const dc = Math.hypot(i - cx, j - cx);
      let h = 0;
      // холмистые местности: широкие всхолмления вне центральной равнины
      const hillMask = smoothstep(n * 0.13, n * 0.32, dc);
      const hf = noise.fbm(i * 0.032 + 10, j * 0.032 + 10, 4) - hillThr;
      if (hf > 0) h += Math.min(1, hf * 3) * hillGain * hf * hillMask * (0.7 + 0.5 * noise2.fbm(i * 0.09, j * 0.09, 3));
      // горные массивы с гребнями
      for (const m of massifs) {
        const ca = Math.cos(m.ang);
        const sa = Math.sin(m.ang);
        const dx = i - m.x;
        const dy = j - m.y;
        const u = (dx * ca + dy * sa) / m.elong;
        const v = -dx * sa + dy * ca;
        const d = Math.hypot(u, v) / m.r;
        if (d >= 1) continue;
        const body = smoothstep(1, 0.08, d);
        const ridge = 1 - Math.abs(noise2.fbm(i * 0.06 + m.x, j * 0.06 + m.y, 4) * 2);
        h += body * body * m.h * (0.5 + 0.5 * Math.max(0, ridge)) * (0.85 + 0.3 * noise.noise(i * 0.2, j * 0.2));
      }
      // кромка карты: пологий вал, чтобы мир не обрывался
      const ring = smoothstep(rimWidth, 0, edge);
      h += ring * ring * rimAmp * (c.ringBase * 0.5 + c.ringNoise * 0.6 * Math.abs(noise2.fbm(i * 0.08, j * 0.08, 3)) + c.ringExtra * ring);

      // вода
      let water = 0;
      for (const r of rivers) {
        const q = distToPolyline(i, j, r.pts);
        const w = r.w * (0.75 + 0.5 * q.t);
        water = Math.max(water, smoothstep(w, w * 0.3, q.d));
      }
      for (const l of lakes) {
        const ld = Math.hypot(i - l.x, j - l.y) / (l.r * (1 + 0.35 * noise2.noise(i * 0.12, j * 0.12)));
        water = Math.max(water, smoothstep(1.35, 0.55, ld) * (1 - smoothstep(rimWidth * 0.6, 0, edge) * 0.6));
      }
      if (water > 0) {
        h *= 1 - smoothstep(0, 0.9, water);
        if (h < 1) h = 0;
        h -= water * c.waterDepth;
      }
      if (Math.abs(h) < 0.04) h = 0;
      heights[j * (n + 1) + i] = h;
    }
  }
  classifyTerrain(heights, terrain, n, p.flatEpsilon);
  return { size: n, heights, terrain };
}
