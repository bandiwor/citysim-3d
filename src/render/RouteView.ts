import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, type Scene } from 'three';
import type { Game } from '../core/Game';
import type { View } from './View';

const Y = 0.7;

/** Линии маршрутов общественного транспорта поверх дорог (когда включён показ) и кольца вокруг остановок маршрутов. */
export class RouteView implements View {
  private _mesh: Mesh;
  private _dirty = true;
  private _shown = false;
  private _focus = 0;

  constructor(scene: Scene, private _game: Game) {
    this._mesh = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }));
    this._mesh.frustumCulled = false;
    this._mesh.renderOrder = 4;
    this._mesh.visible = false;
    scene.add(this._mesh);
    _game.bus.on('routes:changed', () => (this._dirty = true));
    _game.bus.on('stops:changed', () => (this._dirty = true));
  }

  /** Подсветить один маршрут (0 — все). */
  setFocus(id: number): void {
    this._focus = id;
    this._dirty = true;
  }

  update(): void {
    const tr = this._game.get('transit');
    if (tr.showRoutes !== this._shown) {
      this._shown = tr.showRoutes;
      this._mesh.visible = this._shown;
      this._dirty = true;
    }
    if (!this._shown || !this._dirty) return;
    this._dirty = false;
    const pos: number[] = [];
    const col: number[] = [];
    const hw = 1.2;
    for (const r of tr.routes) {
      if (this._focus && r.id !== this._focus) continue;
      const cr = ((r.color >> 16) & 255) / 255;
      const cg = ((r.color >> 8) & 255) / 255;
      const cb = (r.color & 255) / 255;
      for (const seg of r.polyline) {
        for (let i = 0; i < seg.length - 1; i++) {
          const a = seg[i];
          const b = seg[i + 1];
          const l = Math.hypot(b.x - a.x, b.z - a.z);
          if (l < 0.01) continue;
          const nx = (-(b.z - a.z) / l) * hw;
          const nz = ((b.x - a.x) / l) * hw;
          pos.push(a.x - nx, Y, a.z - nz, a.x + nx, Y, a.z + nz, b.x + nx, Y, b.z + nz, a.x - nx, Y, a.z - nz, b.x + nx, Y, b.z + nz, b.x - nx, Y, b.z - nz);
          for (let k = 0; k < 6; k++) col.push(cr, cg, cb);
        }
      }
      // кружки остановок
      for (const sid of r.stops) {
        const s = tr.stopById(sid);
        if (!s) continue;
        const n = 10;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2;
          const a1 = ((i + 1) / n) * Math.PI * 2;
          pos.push(s.x, Y + 0.05, s.z, s.x + Math.cos(a0) * 3, Y + 0.05, s.z + Math.sin(a0) * 3, s.x + Math.cos(a1) * 3, Y + 0.05, s.z + Math.sin(a1) * 3);
          for (let k = 0; k < 3; k++) col.push(cr, cg, cb);
        }
      }
    }
    this._mesh.geometry.dispose();
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    this._mesh.geometry = g;
  }
}
