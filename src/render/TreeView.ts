import { Color, Matrix4, MeshLambertMaterial, type Scene } from 'three';
import { CELL } from '../config/constants';
import type { Game } from '../core/Game';
import { Rng } from '../core/Rng';
import { obbDist } from '../world/geometry';
import { Noise } from '../world/Noise';
import { Terrain } from '../world/Terrain';
import { InstancePool } from './InstancePool';
import { treeModel } from './models';
import type { View } from './View';

const PER_CELL = 4;

interface Tree {
  id: number;
  x: number;
  z: number;
}

/** Декоративные деревья; исчезают там, где проложена дорога, размечена зона или стоит здание. */
export class TreeView implements View {
  private _pool: InstancePool;
  private _trees: Tree[] = [];
  private _graphVersion = -1;
  private _zoneVersion = -1;
  private _worldVersion = -1;
  private _timer = 0;
  private _force = true;

  constructor(scene: Scene, private _game: Game) {
    this._pool = new InstancePool(treeModel(), new MeshLambertMaterial({ vertexColors: true }), _game.config.render.treeLimit);
    scene.add(this._pool.mesh);
    const w = _game.world;
    const rng = new Rng(w.seed + 99);
    const noise = new Noise(w.seed + 3);
    const m = new Matrix4();
    const col = new Color();
    for (let i = 0; i < w.cells; i++) {
      const x = i % w.size;
      const y = (i / w.size) | 0;
      const t = w.terrain[i];
      if (t === Terrain.Water) continue;
      const forest = noise.fbm(x * 0.12 + 5, y * 0.12 + 5, 3);
      let p = t === Terrain.Blocked ? 0.45 : forest > 0.05 ? 0.45 : 0.035;
      if (t === Terrain.Blocked && w.vertexHeight(x, y) > 22) p = 0;
      if (rng.next() > p) continue;
      const n = 1 + rng.int(0, PER_CELL - 1);
      for (let k = 0; k < n; k++) {
        const wx = (x + 0.15 + rng.next() * 0.7) * CELL;
        const wz = (y + 0.15 + rng.next() * 0.7) * CELL;
        const s = 0.8 + rng.next() * 0.7;
        m.makeScale(s, s * (0.9 + rng.next() * 0.4), s).setPosition(wx, w.heightAt(wx, wz) - 0.1, wz);
        const shade = 0.7 + rng.next() * 0.5;
        const id = i * PER_CELL + k;
        this._pool.set(id, m, col.setRGB(shade * 0.9, shade, shade * 0.85).getHex());
        this._trees.push({ id, x: wx, z: wz });
      }
    }
  }

  private _blocked(x: number, z: number): boolean {
    const w = this._game.world;
    if (w.graph.clearance(x, z, 6) < 1.8) return true;
    for (const c of w.zones.near(x, z, CELL * 0.8)) if (c.zone || c.building) return true;
    for (const b of w.buildingsNear(x, z, 12)) if (obbDist(w.obbOf(b), { x, z }) < 1.5) return true;
    return false;
  }

  update(realDt: number): void {
    const w = this._game.world;
    this._timer += realDt;
    const changed = w.graph.version !== this._graphVersion || w.zones.version !== this._zoneVersion || w.version !== this._worldVersion;
    if (!this._force && (!changed || this._timer < 0.3)) return;
    this._timer = 0;
    this._force = false;
    this._graphVersion = w.graph.version;
    this._zoneVersion = w.zones.version;
    this._worldVersion = w.version;
    this._trees = this._trees.filter((t) => {
      if (!this._blocked(t.x, t.z)) return true;
      this._pool.remove(t.id);
      return false;
    });
  }
}
