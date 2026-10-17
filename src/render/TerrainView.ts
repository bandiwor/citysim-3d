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
import { Noise } from '../world/Noise';
import { CELL, WATER_LEVEL, type World } from '../world/World';

/** Рельеф с раскраской по высоте, вода и дальний фон. */
export class TerrainView {
  readonly mesh: Mesh;
  readonly water: Mesh;

  constructor(scene: Scene, world: World) {
    const n = world.size;
    const noise = new Noise(world.seed + 5);
    const pos = new Float32Array((n + 1) * (n + 1) * 3);
    const col = new Float32Array((n + 1) * (n + 1) * 3);
    const c = new Color();
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const k = j * (n + 1) + i;
        const h = world.heights[k];
        pos[k * 3] = i * CELL;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = j * CELL;
        const v = noise.fbm(i * 0.35, j * 0.35, 2);
        if (h < WATER_LEVEL - 0.6) c.setRGB(0.42, 0.38, 0.28);
        else if (h < -0.3) c.setRGB(0.76, 0.7, 0.5);
        else if (h <= 0.05) c.setRGB(0.36 + v * 0.1, 0.62 + v * 0.14, 0.3 + v * 0.08);
        else if (h < 9) c.setRGB(0.3 + v * 0.1, 0.52 + v * 0.1, 0.26).lerp(new Color(0.45, 0.42, 0.34), Math.min(1, h / 12));
        else if (h < 24) c.setRGB(0.46 + v * 0.08, 0.43 + v * 0.08, 0.38 + v * 0.06);
        else c.setRGB(0.92, 0.94, 0.96).lerp(new Color(0.55, 0.53, 0.5), Math.max(0, 1 - (h - 24) / 8));
        col[k * 3] = c.r;
        col[k * 3 + 1] = c.g;
        col[k * 3 + 2] = c.b;
      }
    }
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
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new Float32BufferAttribute(col, 3));
    geo.setIndex(new Uint32BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    this.mesh = new Mesh(geo, new MeshLambertMaterial({ vertexColors: true }));
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
  }
}
