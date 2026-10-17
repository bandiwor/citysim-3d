import type { GameConfig } from '../config/gameConfig';
import { smoothstep } from '../core/Rng';
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
}

export const terrainParams = (cfg: GameConfig, seed: number, size = cfg.world.size): TerrainParams => ({
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

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
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
      if (max > p.flatEpsilon) t = Terrain.Blocked;
      else if (min < -p.flatEpsilon) t = Terrain.Water;
      terrain[y * n + x] = t;
    }
  }
  return { size: n, heights, terrain };
}
