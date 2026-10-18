import { Color, type BufferGeometry, Matrix4, Quaternion, Vector3, type Scene } from 'three';
import type { Game } from '../core/Game';
import { isBuilding, type Building } from '../core/types';
import './serviceExtras';
import './modelsV2';
import { installedUpgrades } from '../data/services';
import { BuildingMaterials } from './Materials';
import { InstancePool } from './InstancePool';
import { serviceModel, zoneModel } from './models';
import type { View } from './View';

const TINTS: Record<string, number[]> = {
  res: [0xf4ede0, 0xe9d9c4, 0xd9e4ee, 0xe6d0d0, 0xdfe8d4, 0xf2e2b8, 0xcfd8e8],
  com: [0xffffff, 0xdbe9f6, 0xf6e4d4, 0xe3f0e6, 0xf0dcef],
  ind: [0xd5dbe2, 0xe6e0d0, 0xc9d2da, 0xdcd6cc],
};

const ABANDONED = 0x8f8780;
const PLAIN = 0xffffff;

interface Slot {
  pool: InstancePool;
  grow: number;
  color: number;
}

/** Здания: по одному InstancedMesh на модель (зона/уровень/вариант либо служба), анимация появления, пожары. */
export class BuildingView implements View {
  readonly materials = new BuildingMaterials();
  private _pools = new Map<string, InstancePool>();
  private _slots = new Map<number, Slot>();
  private _burning = new Set<number>();
  private _m = new Matrix4();
  private _q = new Quaternion();
  private _p = new Vector3();
  private _s = new Vector3();
  private _c = new Color();
  private _t = 0;

  constructor(private _scene: Scene, private _game: Game) {
    _game.bus.on('building:added', (b) => this._add(b, true));
    _game.bus.on('building:removed', (b) => this._remove(b));
    _game.bus.on('building:updated', (b) => {
      // достроенное здание «вырастает»: анимируем, если до этого модели не было
      const had = this._slots.has(b.id);
      this._remove(b);
      this._add(b, !had);
    });
    for (const b of _game.world.list()) this._add(b, false);
  }

  private _poolFor(b: Building): InstancePool {
    const key = b.kind === 'zone' ? `${b.zone}:${b.level}:${b.variant}:${b.wealth}` : `${b.defId}:${b.up}`;
    let pool = this._pools.get(key);
    if (!pool) {
      const geo = b.kind === 'zone' ? zoneModel(b.zone, b.level, b.variant, b.wealth) : this._serviceGeo(b);
      pool = new InstancePool(geo, this.materials.material, b.kind === 'zone' ? 2600 : 200);
      this._pools.set(key, pool);
      this._scene.add(pool.mesh);
    }
    return pool;
  }

  private _serviceGeo(b: Building): BufferGeometry {
    const def = this._game.services.require(b.defId);
    return serviceModel(def.model, def.size[0], def.size[1], installedUpgrades(def, b.up).map((u) => u.id));
  }

  private _tint(b: Building): number {
    if (b.abandoned) return ABANDONED;
    if (b.kind === 'service') return PLAIN;
    const list = TINTS[b.zone] ?? [PLAIN];
    return list[(b.id * 2654435761) % list.length >>> 0] ?? PLAIN;
  }

  private _add(b: Building, animate: boolean): void {
    if (isBuilding(b)) return;
    const pool = this._poolFor(b);
    const slot: Slot = { pool, grow: animate ? 0 : 1, color: this._tint(b) };
    this._slots.set(b.id, slot);
    this._write(b, slot);
    pool.setColor(b.id, slot.color);
    if (b.fire > 0) this._burning.add(b.id);
  }

  private _remove(b: Building): void {
    const s = this._slots.get(b.id);
    if (!s) return;
    s.pool.remove(b.id);
    this._slots.delete(b.id);
    this._burning.delete(b.id);
  }

  private _write(b: Building, s: Slot): void {
    const k = s.grow < 1 ? 1 - (1 - s.grow) ** 3 : 1;
    this._p.set(b.x, 0.12, b.z);
    this._q.setFromAxisAngle(this._yAxis, b.rot);
    this._s.set(1, Math.max(0.02, k), 1);
    s.pool.set(b.id, this._m.compose(this._p, this._q, this._s), s.grow === 0 ? s.color : undefined);
  }

  private _yAxis = new Vector3(0, 1, 0);

  update(realDt: number): void {
    this._t += realDt;
    const w = this._game.world;
    for (const [id, s] of this._slots) {
      const b = w.buildings.get(id);
      if (!b) continue;
      if (s.grow < 1) {
        s.grow = Math.min(1, s.grow + realDt * 1.8);
        this._write(b, s);
      }
      if (b.fire > 0) this._burning.add(id);
      else if (this._burning.has(id)) {
        this._burning.delete(id);
        s.pool.setColor(id, s.color);
      }
    }
    // горящие здания мерцают
    const flick = 0.5 + 0.5 * Math.sin(this._t * 14);
    for (const id of this._burning) {
      const s = this._slots.get(id);
      if (s) s.pool.setColor(id, this._c.setRGB(1, 0.25 + 0.3 * flick, 0.05).getHex());
    }
  }
}
