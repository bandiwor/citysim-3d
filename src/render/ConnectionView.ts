import { Matrix4, MeshLambertMaterial, type Scene } from 'three';
import type { Game } from '../core/Game';
import { GeomBuilder } from './GeomBuilder';
import { InstancePool } from './InstancePool';
import type { View } from './View';

/** Знак у выезда к соседнему городу: две стойки, синий щит со стрелкой и флажок. */
function signModel() {
  return new GeomBuilder()
    .plain()
    .box(0.18, 3.4, 0.18, -1.4, 0, 0, 0x8a9096)
    .box(0.18, 3.4, 0.18, 1.4, 0, 0, 0x8a9096)
    .box(3.4, 1.5, 0.14, 0, 1.9, 0, 0x2f6fd6)
    .box(3.1, 1.25, 0.16, 0, 2.02, 0, 0x3a7fe6)
    .box(1.6, 0.22, 0.18, -0.2, 2.6, 0, 0xffffff)
    .box(0.5, 0.5, 0.18, 0.75, 2.45, 0, 0xffffff, { rz: Math.PI / 4 })
    .box(2.4, 0.12, 0.18, 0, 2.2, 0, 0xdfe6ef, { detail: true })
    .box(1.8, 0.12, 0.18, 0, 1.95, 0, 0xdfe6ef, { detail: true })
    .build();
}

/** Знаки на выездах к соседям (пересобираются при изменении сети). */
export class ConnectionView implements View {
  private _pool: InstancePool;
  private _dirty = true;
  private _m = new Matrix4();

  constructor(scene: Scene, private _game: Game) {
    this._pool = new InstancePool(signModel(), new MeshLambertMaterial({ vertexColors: true }), 256);
    scene.add(this._pool.mesh);
    _game.bus.on('trade:changed', () => (this._dirty = true));
  }

  update(): void {
    if (!this._dirty) return;
    const trade = this._game.get('trade');
    if (!trade) return;
    this._dirty = false;
    this._pool.clear();
    const w = this._game.world;
    trade.links.forEach((l, i) => {
      // щит стоит сбоку от дороги и смотрит внутрь города
      const yaw = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }[l.side];
      const along = l.side === 'n' || l.side === 's' ? [7, 0] : [0, 7];
      const inward = { n: [0, 6], s: [0, -6], w: [6, 0], e: [-6, 0] }[l.side];
      const x = l.x + along[0] + inward[0];
      const z = l.z + along[1] + inward[1];
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      this._m.set(c, 0, s, x, 0, 1, 0, w.heightAt(x, z), -s, 0, c, z, 0, 0, 0, 1);
      this._pool.set(i, this._m);
    });
  }
}
