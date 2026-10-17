import { smoothstep } from '../core/Rng';
import { Noise } from './Noise';
import { Terrain, type World } from './World';

/**
 * Рельеф: плоская застраиваемая равнина (высота ровно 0) + река, озеро, холмы и горное кольцо по краям.
 * Всё, что не «ровно 0», — не годится под застройку; впадины (вода) — только под мосты.
 */
export function generateTerrain(w: World): void {
  const n = w.size;
  const noise = new Noise(w.seed);
  const noise2 = new Noise(w.seed ^ 0x9e3779b9);
  const phase = (w.seed % 628) / 100;
  const cx = n / 2;
  const lakeX = n * (0.72 + 0.08 * noise.noise(1.3, 2.1));
  const lakeY = n * (0.68 + 0.08 * noise.noise(4.1, 7.7));
  const lakeR = n * 0.12;

  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const edge = Math.min(i, j, n - i, n - j);
      const dc = Math.hypot(i - cx, j - cx);

      // Холмы внутри карты (не ближе ~16 клеток к центру).
      const hillMask = smoothstep(14, 28, dc);
      let h = Math.max(0, noise.fbm(i * 0.045 + 10, j * 0.045 + 10, 4) - 0.12) * 46 * hillMask;

      // Горное кольцо.
      const ring = smoothstep(11, 0, edge);
      h += ring * ring * (18 + 26 * Math.abs(noise2.fbm(i * 0.08, j * 0.08, 3)) + 12 * ring);

      // Река (извилистая, чтобы делить карту на части → нужны мосты).
      const rx = n * 0.3 + Math.sin(j * 0.075 + phase) * n * 0.1 + noise.noise(j * 0.05, 3.3) * n * 0.05;
      const rd = Math.abs(i - rx);
      const river = smoothstep(4.2, 1.2, rd) * (1 - smoothstep(0.55, 0.95, ring));

      // Озеро.
      const ld = Math.hypot(i - lakeX, j - lakeY) / (lakeR * (1 + 0.35 * noise2.noise(i * 0.12, j * 0.12)));
      const lake = smoothstep(1.35, 0.55, ld) * (1 - ring);

      const water = Math.max(river, lake);
      if (water > 0 && h < 1) h = 0;
      h -= water * 3.4;

      if (Math.abs(h) < 0.04) h = 0;
      w.heights[j * (n + 1) + i] = h;
    }
  }

  // Классификация клеток.
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let min = Infinity;
      let max = -Infinity;
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const h = w.vertexHeight(x + dx, y + dy);
          if (h < min) min = h;
          if (h > max) max = h;
        }
      }
      let t: number = Terrain.Land;
      if (max > 0.05) t = Terrain.Blocked;
      else if (min < -0.05) t = Terrain.Water;
      w.terrain[y * n + x] = t;
    }
  }
}
