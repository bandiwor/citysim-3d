import { Color, Matrix4, MeshLambertMaterial, type Scene } from 'three';
import type { Game } from '../core/Game';
import { Rng } from '../core/Rng';
import { Noise } from '../world/Noise';
import { CELL, Terrain } from '../world/World';
import { InstancePool } from './InstancePool';
import { treeModel } from './models';
import type { View } from './View';

const PER_CELL = 4;

/** Декоративные деревья; исчезают с клеток, на которых что-то построено или размечено. */
export class TreeView implements View {
  private _pool: InstancePool;
  private _cells = new Set<number>();
  private _dirty = false;

  constructor(scene: Scene, private _game: Game) {
    this._pool = new InstancePool(treeModel(), new MeshLambertMaterial({ vertexColors: true }), 9000);
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
        this._pool.set(i * PER_CELL + k, m, col.setRGB(shade * 0.9, shade, shade * 0.85).getHex());
      }
      this._cells.add(i);
    }
    const mark = (): void => {
      this._dirty = true;
    };
    for (const e of ['roads:changed', 'zones:changed'] as const) _game.bus.on(e, mark);
    mark();
  }

  update(): void {
    if (!this._dirty) return;
    this._dirty = false;
    const w = this._game.world;
    for (const i of this._cells) {
      if (w.terrain[i] !== Terrain.Land) continue;
      if (w.road[i] || w.occupant[i] || w.zone[i]) {
        for (let k = 0; k < PER_CELL; k++) this._pool.remove(i * PER_CELL + k);
        this._cells.delete(i);
      }
    }
  }
}
