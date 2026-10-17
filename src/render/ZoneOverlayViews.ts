import { LineSegments, BufferGeometry, Float32BufferAttribute, LineBasicMaterial, type Scene } from 'three';
import type { Game } from '../core/Game';
import { CELL } from '../world/World';
import { CellLayer } from './CellLayer';
import type { View } from './View';

/** Окраска зон (R/C/I) на свободных клетках. */
export class ZoneLayerView implements View {
  private _layer: CellLayer;
  private _dirty = true;

  constructor(scene: Scene, private _game: Game) {
    this._layer = new CellLayer(scene, _game.world.size, 0.09, 1);
    _game.bus.on('zones:changed', () => (this._dirty = true));
    _game.bus.on('roads:changed', () => (this._dirty = true));
  }

  update(): void {
    if (!this._dirty) return;
    this._dirty = false;
    const w = this._game.world;
    this._layer.clear();
    for (let i = 0; i < w.cells; i++) {
      const z = w.zone[i];
      if (!z || w.road[i]) continue;
      const c = this._game.zoneTypes.at(z - 1).color;
      const occupied = w.occupant[i] !== 0;
      this._layer.set(i, (c >> 16) & 255, (c >> 8) & 255, c & 255, occupied ? 40 : 130);
    }
    this._layer.flush();
  }
}

/** Тепловая карта выбранного оверлея. */
export class OverlayView implements View {
  private _layer: CellLayer;
  private _active: string | null = null;
  private _timer = 0;
  private _px = new Uint8ClampedArray(4);

  constructor(scene: Scene, private _game: Game) {
    this._layer = new CellLayer(scene, _game.world.size, 0.14, 2);
    this._layer.mesh.visible = false;
    _game.bus.on('overlay:set', (id) => {
      this._active = id;
      this._layer.mesh.visible = id !== null;
      this._timer = 99;
    });
  }

  update(realDt: number): void {
    if (!this._active) return;
    this._timer += realDt;
    if (this._timer < 0.5) return;
    this._timer = 0;
    const def = this._game.overlays.get(this._active);
    if (!def) return;
    this._layer.clear();
    const px = this._px;
    for (let i = 0; i < this._game.world.cells; i++) {
      px.fill(0);
      if (def.colorize(this._game, i, px)) this._layer.set(i, px[0], px[1], px[2], px[3]);
    }
    this._layer.flush();
  }
}

/** Линии сетки клеток (видны при строительстве). */
export class GridView {
  readonly lines: LineSegments;

  constructor(scene: Scene, size: number) {
    const pts: number[] = [];
    const s = size * CELL;
    for (let k = 0; k <= size; k++) {
      pts.push(k * CELL, 0.1, 0, k * CELL, 0.1, s, 0, 0.1, k * CELL, s, 0.1, k * CELL);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pts, 3));
    this.lines = new LineSegments(g, new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false }));
    this.lines.visible = false;
    this.lines.renderOrder = 3;
    scene.add(this.lines);
  }
}
