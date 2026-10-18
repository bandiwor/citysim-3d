import { CELL } from '../config/constants';
import { Terrain, type TerrainData } from '../world/Terrain';

const NICE = [25, 50, 100, 200, 250, 500, 1000, 2000];

export interface PreviewStats {
  water: number;
  plain: number;
  hills: number;
  mountains: number;
}

/**
 * Вид сверху на рельеф с отмывкой рельефа, масштабной линейкой (метры) и стрелкой севера.
 * Возвращает доли воды, равнин (годных под застройку), холмов и гор.
 */
export function drawTerrainPreview(canvas: HTMLCanvasElement, d: TerrainData, waterLabel = ''): PreviewStats {
  const n = d.size;
  const W = canvas.width;
  const img = document.createElement('canvas');
  img.width = n;
  img.height = n;
  const ictx = img.getContext('2d')!;
  const data = ictx.createImageData(n, n);
  const H = (i: number, j: number): number => d.heights[Math.min(n, Math.max(0, j)) * (n + 1) + Math.min(n, Math.max(0, i))];
  const stats: PreviewStats = { water: 0, plain: 0, hills: 0, mountains: 0 };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const h = (H(i, j) + H(i + 1, j) + H(i, j + 1) + H(i + 1, j + 1)) / 4;
      // отмывка: свет с северо-запада
      const slope = (H(i, j) - H(i + 1, j + 1)) * 0.5;
      const shade = Math.max(0.6, Math.min(1.35, 1 + slope * 0.05));
      let r: number;
      let g: number;
      let b: number;
      const t = d.terrain[j * n + i];
      if (t === Terrain.Water) {
        const depth = Math.min(1, -h / 3.4);
        [r, g, b] = [70 - depth * 40, 140 - depth * 55, 200 - depth * 40];
        stats.water++;
      } else if (h <= 0.05) {
        const v = ((i * 7 + j * 13) % 5) * 2;
        [r, g, b] = [118 + v, 170 + v, 96 + v];
        stats.plain++;
      } else if (h < 10) {
        const k = h / 10;
        [r, g, b] = [118 + k * 40, 160 - k * 18, 92 + k * 8];
        stats.hills++;
      } else if (h < 30) {
        const k = (h - 10) / 20;
        [r, g, b] = [150 + k * 20, 140 + k * 14, 100 + k * 28];
        stats.mountains++;
      } else {
        const k = Math.min(1, (h - 30) / 20);
        [r, g, b] = [170 + k * 80, 160 + k * 90, 140 + k * 110];
        stats.mountains++;
      }
      const o = (j * n + i) * 4;
      data.data[o] = Math.min(255, r * shade);
      data.data[o + 1] = Math.min(255, g * shade);
      data.data[o + 2] = Math.min(255, b * shade);
      data.data[o + 3] = 255;
    }
  }
  ictx.putImageData(data, 0, 0);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, W, canvas.height);
  ctx.drawImage(img, 0, 0, W, canvas.height);

  // масштабная линейка: 1 ед. мира = 1 м
  const meters = n * CELL;
  const target = meters / 4;
  const len = NICE.reduce((a, c) => (Math.abs(c - target) < Math.abs(a - target) ? c : a), NICE[0]);
  const px = (len / meters) * W;
  const x0 = 12;
  const y0 = canvas.height - 14;
  ctx.fillStyle = 'rgba(8,12,22,0.55)';
  ctx.fillRect(x0 - 8, y0 - 22, px + 16 + 58, 32);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0 - 5);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x0 + px, y0);
  ctx.lineTo(x0 + px, y0 - 5);
  ctx.moveTo(x0 + px / 2, y0);
  ctx.lineTo(x0 + px / 2, y0 - 3);
  ctx.stroke();
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.fillText(`${len} ${waterLabel || 'm'}`, x0 + px + 8, y0 + 2);
  ctx.fillText('0', x0 - 3, y0 - 9);
  // север
  ctx.fillStyle = 'rgba(8,12,22,0.55)';
  ctx.beginPath();
  ctx.arc(W - 22, 22, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(W - 22, 10);
  ctx.lineTo(W - 17, 24);
  ctx.lineTo(W - 22, 21);
  ctx.lineTo(W - 27, 24);
  ctx.closePath();
  ctx.fill();
  ctx.fillText('N', W - 26, 37);
  const total = n * n;
  return { water: stats.water / total, plain: stats.plain / total, hills: stats.hills / total, mountains: stats.mountains / total };
}
