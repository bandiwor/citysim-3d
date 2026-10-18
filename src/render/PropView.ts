import { Color, Matrix4, MeshLambertMaterial, Quaternion, Vector3, type Scene } from 'three';
import type { Game } from '../core/Game';
import { PROPS } from '../data/props';
import { InstancePool } from './InstancePool';
import { propModel } from './propModels';
import type { View } from './View';

const LIMIT = 4000;
const UP = new Vector3(0, 1, 0);

/** Деревья, кусты, цветы и камни игрока; перестраиваются целиком при изменении (изменения редкие и пачками). */
export class PropView implements View {
  private _pools = new Map<string, InstancePool>();
  private _dirty = true;
  private _m = new Matrix4();
  private _q = new Quaternion();
  private _p = new Vector3();
  private _s = new Vector3();
  private _col = new Color();

  constructor(scene: Scene, private _game: Game) {
    const mat = new MeshLambertMaterial({ vertexColors: true });
    for (const d of PROPS) {
      const pool = new InstancePool(propModel(d.id), mat, LIMIT);
      this._pools.set(d.id, pool);
      scene.add(pool.mesh);
    }
    _game.bus.on('props:changed', () => (this._dirty = true));
    _game.bus.on('terrain:changed', () => (this._dirty = true));
  }

  update(): void {
    if (!this._dirty) return;
    this._dirty = false;
    const w = this._game.world;
    for (const pool of this._pools.values()) pool.mesh.count = 0;
    const counts = new Map<string, number>();
    for (const p of w.props.values()) {
      const pool = this._pools.get(p.kind);
      if (!pool) continue;
      const k = counts.get(p.kind) ?? 0;
      if (k >= pool.capacity) continue;
      counts.set(p.kind, k + 1);
      const def = PROPS.find((d) => d.id === p.kind)!;
      // оттенок детерминирован по id, чтобы не мигал при перестройке
      const shade = def.shade[0] + ((p.id * 2654435761) % 1000) / 1000 * (def.shade[1] - def.shade[0]);
      this._m.compose(this._p.set(p.x, w.heightAt(p.x, p.z) - 0.05, p.z), this._q.setFromAxisAngle(UP, p.rot), this._s.set(p.s, p.s * (0.92 + (p.id % 7) * 0.025), p.s));
      pool.mesh.setMatrixAt(k, this._m);
      pool.mesh.setColorAt(k, this._col.setRGB(shade, shade, shade));
    }
    for (const [kind, pool] of this._pools) {
      pool.mesh.count = counts.get(kind) ?? 0;
      pool.mesh.instanceMatrix.needsUpdate = true;
      if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
    }
  }
}
