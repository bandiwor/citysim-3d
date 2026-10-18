import { Color, Matrix4, MeshLambertMaterial, Vector3, type BufferGeometry, type Scene } from 'three';
import type { Game } from '../core/Game';
import type { VehicleKind } from '../sim/TrafficSystem';
import { withLod } from './GeomBuilder';
import { InstancePool } from './InstancePool';
import { busModel, carModel, garbageModel, hearseModel, policeModel, taxiModel, truckModel } from './models';
import type { View } from './View';

const KINDS: [VehicleKind, () => BufferGeometry, number][] = [
  ['car', carModel, 900],
  ['truck', truckModel, 200],
  ['bus', busModel, 160],
  ['police', policeModel, 40],
  ['garbage', garbageModel, 60],
  ['hearse', hearseModel, 40],
  ['taxi', taxiModel, 80],
];
/** дальше — машины без мелочей (фары, стёкла, бамперы) и без теней */
const LOD_FAR = 140;

/** Рисует все машины из TrafficSystem; экземпляры пересобираются каждый кадр. Ближние — подробные, дальние — упрощённые. */
export class VehicleView implements View {
  private _pools: Record<VehicleKind, InstancePool>[];
  private _m = new Matrix4();
  private _col = new Color();

  constructor(scene: Scene, private _game: Game, private _eye: () => Vector3 = () => new Vector3()) {
    const mat = new MeshLambertMaterial({ vertexColors: true });
    this._pools = [0, 1].map((lod) => {
      const rec = {} as Record<VehicleKind, InstancePool>;
      for (const [kind, model, cap] of KINDS) {
        const pool = new InstancePool(withLod(lod, model), mat, cap);
        pool.mesh.castShadow = lod === 0;
        pool.mesh.receiveShadow = lod === 0;
        rec[kind] = pool;
        scene.add(pool.mesh);
      }
      return rec;
    });
  }

  update(): void {
    const e = this._eye();
    const far2 = LOD_FAR * LOD_FAR;
    const counters = [0, 1].map(() => ({ car: 0, truck: 0, bus: 0, police: 0, garbage: 0, hearse: 0, taxi: 0 }) as Record<VehicleKind, number>);
    for (const v of this._game.get('traffic').vehicles) {
      const dx = v.x - e.x;
      const dz = v.z - e.z;
      const lod = dx * dx + dz * dz + e.y * e.y * 0.36 > far2 ? 1 : 0;
      const pool = this._pools[lod][v.kind];
      const k = counters[lod][v.kind];
      if (k >= pool.capacity) continue;
      counters[lod][v.kind]++;
      const c = Math.cos(v.yaw);
      const s = Math.sin(v.yaw);
      // поворот вокруг Y: +X модели → (cos, 0, -sin)
      this._m.set(c, 0, s, v.x, 0, 1, 0, 0.2, -s, 0, c, v.z, 0, 0, 0, 1);
      pool.mesh.setMatrixAt(k, this._m);
      pool.mesh.setColorAt(k, this._col.setHex(v.color));
    }
    for (let lod = 0; lod < 2; lod++) {
      for (const [kind] of KINDS) {
        const m = this._pools[lod][kind].mesh;
        // без изменений (пусто и было пусто) буферы на видеокарту не отправляем
        if (m.count === 0 && counters[lod][kind] === 0) continue;
        m.count = counters[lod][kind];
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
  }
}
