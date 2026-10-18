import { withSnow } from './snow';
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
  PlaneGeometry,
  Scene,
  Uint32BufferAttribute,
} from 'three';
import type { Game } from '../core/Game';
import { Noise } from '../world/Noise';
import { CELL, type World } from '../world/World';

const smoothstep01 = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Рельеф с раскраской по высоте, вода и дальний фон. Перерисовывается после терраформинга. */
export class TerrainView {
  readonly mesh: Mesh;
  readonly water: Mesh;
  private _pos: Float32Array;
  private _col: Float32Array;
  private _noise: Float32Array;
  private _patch: Float32Array;
  private _geo: BufferGeometry;
  private _dirty = false;

  constructor(scene: Scene, private _world: World, game: Game) {
    const world = _world;
    const n = world.size;
    const WATER_LEVEL = world.cfg.world.waterLevel;
    const noise = new Noise(world.seed + 5);
    this._pos = new Float32Array((n + 1) * (n + 1) * 3);
    this._col = new Float32Array((n + 1) * (n + 1) * 3);
    this._noise = new Float32Array((n + 1) * (n + 1));
    this._patch = new Float32Array((n + 1) * (n + 1));
    const patch = new Noise(world.seed + 41);
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        this._noise[j * (n + 1) + i] = noise.fbm(i * 0.35, j * 0.35, 2);
        // крупные пятна: сочный луг / сухая трава / цветущий луг
        this._patch[j * (n + 1) + i] = patch.fbm(i * 0.045, j * 0.045, 3);
      }
    }
    this._fill();
    const idx = new Uint32Array(n * n * 6);
    let p = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i;
        const b = a + 1;
        const d = a + n + 1;
        const e = d + 1;
        idx[p++] = a;
        idx[p++] = d;
        idx[p++] = b;
        idx[p++] = b;
        idx[p++] = d;
        idx[p++] = e;
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(this._pos, 3));
    geo.setAttribute('color', new Float32BufferAttribute(this._col, 3));
    geo.setIndex(new Uint32BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    this._geo = geo;
    this.mesh = new Mesh(geo, new MeshLambertMaterial({ vertexColors: true }));
    withSnow(this.mesh.material as MeshLambertMaterial);
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    const size = n * CELL;
    this.water = new Mesh(
      new PlaneGeometry(size * 4, size * 4).rotateX(-Math.PI / 2),
      new MeshPhongMaterial({ color: 0x2f7fb8, transparent: true, opacity: 0.8, shininess: 90, specular: 0x88aacc }),
    );
    this.water.position.set(size / 2, WATER_LEVEL, size / 2);
    scene.add(this.water);

    // дальний фон за горами
    const ground = new Mesh(new PlaneGeometry(size * 6, size * 6).rotateX(-Math.PI / 2), new MeshLambertMaterial({ color: 0x4d6b45 }));
    ground.position.set(size / 2, -4.5, size / 2);
    scene.add(ground);
    game.bus.on('terrain:changed', () => (this._dirty = true));
  }

  /** Раскраска и положение вершин по текущим высотам. */
  private _fill(): void {
    const world = this._world;
    const n = world.size;
    const WATER_LEVEL = world.cfg.world.waterLevel;
    const c = new Color();
    const lush = new Color(0.3, 0.58, 0.25);
    const meadow = new Color(0.5, 0.7, 0.3);
    const dry = new Color(0.66, 0.64, 0.34);
    const rock = new Color(0.46, 0.43, 0.36);
    const dark = new Color(0.36, 0.33, 0.3);
    const snow = new Color(0.94, 0.96, 0.98);
    const sand = new Color(0.8, 0.74, 0.52);
    const wet = new Color(0.55, 0.5, 0.36);
    const hAt = (i: number, j: number): number => world.heights[Math.min(n, Math.max(0, j)) * (n + 1) + Math.min(n, Math.max(0, i))];
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const k = j * (n + 1) + i;
        const h = world.heights[k];
        const v = this._noise[k];
        const pch = this._patch[k];
        this._pos[k * 3] = i * CELL;
        this._pos[k * 3 + 1] = h;
        this._pos[k * 3 + 2] = j * CELL;
        const slope = Math.max(Math.abs(hAt(i + 1, j) - hAt(i - 1, j)), Math.abs(hAt(i, j + 1) - hAt(i, j - 1))) * 0.5;
        if (h < WATER_LEVEL - 0.6) c.copy(wet);
        else if (h < -0.3) c.copy(sand).lerp(wet, 0.35);
        else {
          // трава: пятна сочного, обычного и сухого луга
          c.copy(meadow).lerp(lush, smoothstep01(-0.05, 0.2, pch)).lerp(dry, smoothstep01(0.05, 0.3, -pch) * 0.8);
          c.r += v * 0.07;
          c.g += v * 0.1;
          c.b += v * 0.05;
          // песчаный берег
          if (h < 0.35 && this._nearWater(i, j)) c.lerp(sand, 0.75);
          // предгорья и скалы по высоте и крутизне
          const alt = smoothstep01(5, 20, h);
          c.lerp(rock, Math.max(alt * 0.85, Math.min(1, slope / 5) * 0.75));
          c.lerp(dark, smoothstep01(16, 34, h) * 0.5 * (0.6 + v));
          c.lerp(snow, smoothstep01(34, 44, h + v * 4));
        }
        this._col[k * 3] = c.r;
        this._col[k * 3 + 1] = c.g;
        this._col[k * 3 + 2] = c.b;
      }
    }
  }

  /** Есть ли вода в соседних клетках (для песчаного берега). */
  private _nearWater(i: number, j: number): boolean {
    const w = this._world;
    for (let dy = -1; dy <= 0; dy++) {
      for (let dx = -1; dx <= 0; dx++) {
        const x = i + dx;
        const y = j + dy;
        if (x >= 0 && y >= 0 && x < w.size && y < w.size && w.terrain[y * w.size + x] === 1) return true;
      }
    }
    return false;
  }

  update(): void {
    if (!this._dirty) return;
    this._dirty = false;
    this._fill();
    const pos = this._geo.getAttribute('position');
    const col = this._geo.getAttribute('color');
    (pos.array as Float32Array).set(this._pos);
    (col.array as Float32Array).set(this._col);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this._geo.computeVertexNormals();
    this._geo.computeBoundingSphere();
  }
}
