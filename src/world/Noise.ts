import { Rng } from '../core/Rng';

/** 2D градиентный шум (Перлин) с seed и fbm. */
export class Noise {
  private _perm = new Uint8Array(512);
  private _gx = new Float32Array(256);
  private _gy = new Float32Array(256);

  constructor(seed: number) {
    const rng = new Rng(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this._perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) {
      const a = rng.next() * Math.PI * 2;
      this._gx[i] = Math.cos(a);
      this._gy[i] = Math.sin(a);
    }
  }

  /** значение примерно в [-1, 1] */
  noise(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const g = (ix: number, iy: number, dx: number, dy: number): number => {
      const h = this._perm[(this._perm[ix & 255] + iy) & 255];
      return this._gx[h] * dx + this._gy[h] * dy;
    };
    const n00 = g(xi, yi, xf, yf);
    const n10 = g(xi + 1, yi, xf - 1, yf);
    const n01 = g(xi, yi + 1, xf, yf - 1);
    const n11 = g(xi + 1, yi + 1, xf - 1, yf - 1);
    const a = n00 + (n10 - n00) * u;
    const b = n01 + (n11 - n01) * u;
    return (a + (b - a) * v) * 1.41;
  }

  fbm(x: number, y: number, octaves = 4): number {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise(x * f, y * f) * amp;
      f *= 2;
      amp *= 0.5;
    }
    return sum;
  }
}
