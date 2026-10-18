import { CanvasTexture, Color, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3, type Scene } from 'three';
import { CELL } from '../config/constants';
import type { Game, OverlayPainter } from '../core/Game';
import { CellLayer } from './CellLayer';
import type { View } from './View';

const CAPACITY = 24000;
const WHITE = new Color(0xffffff);

function outlineTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 60, 60);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Клетки зонирования вдоль дорог: окраска назначенных зон и контуры всех клеток при строительстве. */
export class ZoneLayerView implements View {
  private _zoned: InstancedMesh;
  private _grid: InstancedMesh;
  private _version = -1;
  private _dirty = true;
  private _m = new Matrix4();
  private _q = new Quaternion();
  private _s = new Vector3(1, 1, 1);
  private _p = new Vector3();
  private _up = new Vector3(0, 1, 0);
  private _col = new Color();

  constructor(scene: Scene, private _game: Game) {
    const geo = new PlaneGeometry(CELL - 0.5, CELL - 0.5).rotateX(-Math.PI / 2);
    this._zoned = new InstancedMesh(geo, new MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), CAPACITY);
    this._grid = new InstancedMesh(geo, new MeshBasicMaterial({ map: outlineTexture(), transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), CAPACITY);
    for (const m of [this._zoned, this._grid]) {
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = 1;
      scene.add(m);
    }
    this._grid.visible = false;
    _game.bus.on('zones:changed', () => (this._dirty = true));
  }

  setGridVisible(v: boolean): void {
    this._grid.visible = v;
  }

  update(): void {
    const w = this._game.world;
    if (!this._dirty && this._version === w.zones.version) return;
    this._dirty = false;
    this._version = w.zones.version;
    let nz = 0;
    let ng = 0;
    for (const c of w.zones.list()) {
      if (c.building) continue;
      this._q.setFromAxisAngle(this._up, c.rot);
      if (ng < CAPACITY) {
        this._m.compose(this._p.set(c.x, 0.09, c.z), this._q, this._s);
        this._grid.setMatrixAt(ng++, this._m);
      }
      if (c.zone && nz < CAPACITY) {
        this._m.compose(this._p.set(c.x, 0.1, c.z), this._q, this._s);
        this._zoned.setMatrixAt(nz, this._m);
        // плотность: средняя светлее, высокая ещё светлее
        this._zoned.setColorAt(nz++, this._col.setHex(this._game.zoneTypes.at(c.zone - 1).color).lerp(WHITE, c.density * 0.28));
      }
    }
    this._zoned.count = nz;
    this._grid.count = ng;
    this._zoned.instanceMatrix.needsUpdate = true;
    if (this._zoned.instanceColor) this._zoned.instanceColor.needsUpdate = true;
    this._grid.instanceMatrix.needsUpdate = true;
  }
}

/** Тепловая карта выбранного оверлея. */
export class OverlayView implements View {
  private _layer: CellLayer;
  private _active: string | null = null;
  private _timer = 0;
  private _painter: OverlayPainter;

  constructor(scene: Scene, private _game: Game) {
    this._layer = new CellLayer(scene, _game.world.size, 0.14, 2);
    this._layer.mesh.visible = false;
    this._painter = { size: _game.world.size, cell: CELL, set: (i, r, g, b, a) => this._layer.set(i, r, g, b, a) };
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
    def.paint(this._game, this._painter);
    this._layer.flush();
  }
}
