import { BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshLambertMaterial, type Scene } from 'three';
import type { Game } from '../core/Game';
import { CELL, Terrain } from '../world/World';
import type { View } from './View';

const ASPHALT_Y = 0.1;
const SIDEWALK = 0xbdb9b0;
const CONCRETE = 0x8d9196;

/** Плоскогранные примитивы в один буфер (без индексов). */
class Poly {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  private _c = new Color();

  private _tri(a: number[], b: number[], c: number[], n: number[], color: number): void {
    this._c.setHex(color);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(this._c.r, this._c.g, this._c.b);
    }
  }

  /** горизонтальный прямоугольник, нормаль вверх */
  rect(x0: number, z0: number, x1: number, z1: number, y: number, color: number): void {
    const n = [0, 1, 0];
    this._tri([x0, y, z0], [x0, y, z1], [x1, y, z0], n, color);
    this._tri([x1, y, z0], [x0, y, z1], [x1, y, z1], n, color);
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): void {
    this.rect(x0, z0, x1, z1, y1, color);
    const side = (a: number[], b: number[], c: number[], d: number[], n: number[]): void => {
      this._tri(a, b, c, n, color);
      this._tri(c, b, d, n, color);
    };
    side([x0, y1, z0], [x1, y1, z0], [x0, y0, z0], [x1, y0, z0], [0, 0, -1]);
    side([x1, y1, z1], [x0, y1, z1], [x1, y0, z1], [x0, y0, z1], [0, 0, 1]);
    side([x0, y1, z1], [x0, y1, z0], [x0, y0, z1], [x0, y0, z0], [-1, 0, 0]);
    side([x1, y1, z0], [x1, y1, z1], [x1, y0, z0], [x1, y0, z1], [1, 0, 0]);
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

/** Дороги: асфальт, тротуары, разметка, мосты и остановки — одной пересобираемой геометрией. */
export class RoadView implements View {
  private _mesh: Mesh;
  private _dirty = true;

  constructor(scene: Scene, private _game: Game) {
    this._mesh = new Mesh(new BufferGeometry(), new MeshLambertMaterial({ vertexColors: true }));
    this._mesh.receiveShadow = true;
    this._mesh.frustumCulled = false;
    scene.add(this._mesh);
    _game.bus.on('roads:changed', () => (this._dirty = true));
    _game.bus.on('stops:changed', () => (this._dirty = true));
  }

  update(): void {
    if (!this._dirty) return;
    this._dirty = false;
    this._mesh.geometry.dispose();
    this._mesh.geometry = this._build();
  }

  private _build(): BufferGeometry {
    const g = this._game;
    const w = g.world;
    const n = w.size;
    const p = new Poly();
    const isRoad = (x: number, y: number): boolean => w.inBounds(x, y) && w.road[w.idx(x, y)] !== 0;
    // стороны: 0=N(-z) 1=E(+x) 2=S(+z) 3=W(-x)
    const DX = [0, 1, 0, -1];
    const DY = [-1, 0, 1, 0];

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const r = w.road[i];
        if (!r) continue;
        const t = g.roadTypes.at(r - 1);
        const bridge = w.terrain[i] === Terrain.Water;
        const lift = bridge ? 0.3 : 0;
        const ay = ASPHALT_Y + lift;
        const x0 = x * CELL;
        const z0 = y * CELL;
        const cx = x0 + CELL / 2;
        const cz = z0 + CELL / 2;
        const conn = [0, 1, 2, 3].map((s) => isRoad(x + DX[s], y + DY[s]));
        const nconn = conn.filter(Boolean).length;
        const shade = (x * 7 + y * 13) % 5;
        p.rect(x0, z0, x0 + CELL, z0 + CELL, ay, t.color + shade * 0x010101);

        if (bridge) {
          p.box(x0, -1.0, z0, x0 + CELL, ay - 0.02, z0 + CELL, CONCRETE);
          p.box(cx - 0.8, -4.5, cz - 0.8, cx + 0.8, -1.0, cz + 0.8, 0x7c8085);
        }

        // обочины
        const sw = t.id === 'highway' ? 0.6 : 1.1;
        const swTop = bridge ? ay + 0.85 : ay + 0.16;
        const swColor = t.id === 'highway' ? 0x9a9c9f : bridge ? 0xa7abb0 : SIDEWALK;
        if (!conn[0]) p.box(x0, ay, z0, x0 + CELL, swTop, z0 + sw, swColor);
        if (!conn[2]) p.box(x0, ay, z0 + CELL - sw, x0 + CELL, swTop, z0 + CELL, swColor);
        if (!conn[3]) p.box(x0, ay, z0, x0 + sw, swTop, z0 + CELL, swColor);
        if (!conn[1]) p.box(x0 + CELL - sw, ay, z0, x0 + CELL, swTop, z0 + CELL, swColor);
        // угловые тумбы на перекрёстках
        for (const [sa, sb, ox, oz] of [[0, 3, 0, 0], [0, 1, 1, 0], [2, 3, 0, 1], [2, 1, 1, 1]] as const) {
          if (conn[sa] && conn[sb] && !isRoad(x + DX[sa] + DX[sb], y + DY[sa] + DY[sb])) {
            const px = x0 + ox * (CELL - sw);
            const pz = z0 + oz * (CELL - sw);
            p.box(px, ay, pz, px + sw, bridge ? swTop : ay + 0.16, pz + sw, swColor);
          }
        }

        // разметка
        const my = ay + 0.02;
        const line = (side: number, from: number, to: number, off: number, wd: number, color: number): void => {
          // отрезок вдоль стороны от центра: расстояние from..to, смещение off поперёк
          const a = DX[side] * from;
          const b = DX[side] * to;
          const c = DY[side] * from;
          const d = DY[side] * to;
          if (DX[side] !== 0) p.rect(cx + Math.min(a, b), cz + off - wd, cx + Math.max(a, b), cz + off + wd, my, color);
          else p.rect(cx + off - wd, cz + Math.min(c, d), cx + off + wd, cz + Math.max(c, d), my, color);
        };
        const inter = nconn >= 3;
        for (let s = 0; s < 4; s++) {
          if (!conn[s]) continue;
          if (t.id === 'street') {
            line(s, 2, 3.4, 0, 0.12, 0xd8d8d0);
          } else if (t.id === 'avenue') {
            const from = inter ? 1.8 : 0;
            if (DX[s] !== 0) p.box(cx + Math.min(DX[s] * from, DX[s] * CELL / 2), ay, cz - 0.4, cx + Math.max(DX[s] * from, (DX[s] * CELL) / 2), ay + 0.22, cz + 0.4, 0x5f8a52);
            else p.box(cx - 0.4, ay, cz + Math.min(DY[s] * from, (DY[s] * CELL) / 2), cx + 0.4, ay + 0.22, cz + Math.max(DY[s] * from, (DY[s] * CELL) / 2), 0x5f8a52);
            line(s, 2.4, 3.8, 3.1, 0.1, 0xd8d8d0);
            line(s, 2.4, 3.8, -3.1, 0.1, 0xd8d8d0);
          } else {
            line(s, inter ? 2 : 0, CELL / 2, 0.28, 0.07, 0xe0b82e);
            line(s, inter ? 2 : 0, CELL / 2, -0.28, 0.07, 0xe0b82e);
            line(s, 2.2, 3.6, 2.8, 0.1, 0xe4e4e0);
            line(s, 2.2, 3.6, -2.8, 0.1, 0xe4e4e0);
          }
        }
        if (nconn === 2 && t.id === 'street') {
          if (conn[0] && conn[2]) p.rect(cx - 0.12, cz - 0.7, cx + 0.12, cz + 0.7, my, 0xd8d8d0);
          else if (conn[1] && conn[3]) p.rect(cx - 0.7, cz - 0.12, cx + 0.7, cz + 0.12, my, 0xd8d8d0);
        }

        // остановка
        if (w.stop[i]) this._stop(p, x0, z0, conn, ay);
      }
    }
    return p.build();
  }

  private _stop(p: Poly, x0: number, z0: number, conn: boolean[], ay: number): void {
    let side = [0, 1, 2, 3].find((s) => !conn[s]);
    if (side === undefined) side = 0;
    const cx = x0 + CELL / 2;
    const cz = z0 + CELL / 2;
    // локальные координаты: a вдоль стороны, b от внешнего края внутрь
    const put = (a0: number, b0: number, a1: number, b1: number, y0: number, y1: number, color: number): void => {
      const pt = (a: number, b: number): [number, number] => {
        switch (side) {
          case 0: return [cx + a, z0 + b];
          case 2: return [cx + a, z0 + CELL - b];
          case 3: return [x0 + b, cz + a];
          default: return [x0 + CELL - b, cz + a];
        }
      };
      const [xa, za] = pt(a0, b0);
      const [xb, zb] = pt(a1, b1);
      p.box(Math.min(xa, xb), ay + y0, Math.min(za, zb), Math.max(xa, xb), ay + y1, Math.max(za, zb), color);
    };
    put(-1.5, 0.2, 1.5, 1.2, 2.5, 2.7, 0x2f6fb5);
    put(-1.4, 0.25, -1.3, 0.35, 0.2, 2.5, 0x555b61);
    put(1.3, 0.25, 1.4, 0.35, 0.2, 2.5, 0x555b61);
    put(-1.35, 0.2, 1.35, 0.3, 0.8, 2.4, 0x9cc4e4);
    put(-0.9, 0.5, 0.9, 0.9, 0.2, 0.6, 0x6b5a45);
    put(1.9, 0.3, 2.0, 0.4, 0.2, 4, 0x555b61);
    put(1.5, 0.25, 2.4, 0.45, 3.2, 4, 0x2f6fb5);
  }
}
