import { Color, Matrix4, MeshLambertMaterial, type Scene } from 'three';
import type { Game } from '../core/Game';
import type { VehicleKind } from '../sim/TrafficSystem';
import { InstancePool } from './InstancePool';
import { busModel, carModel, truckModel } from './models';
import type { View } from './View';

/** Рисует все машины из TrafficSystem; экземпляры пересобираются каждый кадр. */
export class VehicleView implements View {
  private _pools: Record<VehicleKind, InstancePool>;
  private _m = new Matrix4();
  private _col = new Color();

  constructor(scene: Scene, private _game: Game) {
    const mat = new MeshLambertMaterial({ vertexColors: true });
    this._pools = {
      car: new InstancePool(carModel(), mat, 900),
      truck: new InstancePool(truckModel(), mat, 200),
      bus: new InstancePool(busModel(), mat, 120),
    };
    for (const p of Object.values(this._pools)) scene.add(p.mesh);
  }

  update(): void {
    const pools = this._pools;
    for (const p of Object.values(pools)) p.mesh.count = 0;
    const counters: Record<VehicleKind, number> = { car: 0, truck: 0, bus: 0 };
    for (const v of this._game.get('traffic').vehicles) {
      const pool = pools[v.kind];
      const k = counters[v.kind];
      if (k >= pool.capacity) continue;
      counters[v.kind]++;
      const c = Math.cos(v.yaw);
      const s = Math.sin(v.yaw);
      // поворот вокруг Y: +X модели → (cos, 0, -sin)
      this._m.set(c, 0, s, v.x, 0, 1, 0, 0.2, -s, 0, c, v.z, 0, 0, 0, 1);
      pool.mesh.setMatrixAt(k, this._m);
      pool.mesh.setColorAt(k, this._col.setHex(v.color));
    }
    for (const kind of Object.keys(pools) as VehicleKind[]) {
      const m = pools[kind].mesh;
      m.count = counters[kind];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
