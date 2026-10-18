import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Quaternion, Vector3, type BufferGeometry, type Scene } from 'three';
import type { Game } from '../core/Game';
import type { Building } from '../core/types';
import { installedUpgrades } from '../data/services';
import { GeomBuilder } from './GeomBuilder';
import { serviceModel, zoneModel } from './models';
import './serviceExtras';
import './modelsV2';
import type { View } from './View';

const MAX = 400;

/**
 * Стройплощадки: у нового здания сначала виден фундамент, затем растёт каркас, а рядом стоит кран (одинаковый,
 * высота мачты зависит от высоты будущего здания). При повышении уровня и улучшении вокруг работающего здания ставятся леса и кран.
 */
export class ConstructionView implements View {
  private _slab: InstancedMesh;
  private _frame: InstancedMesh;
  private _mast: InstancedMesh;
  private _head: InstancedMesh;
  private _heights = new Map<string, number>();
  private _scaffolds = new Group();
  private _scafPool: Mesh[] = [];
  private _scafGeo = new Map<string, BufferGeometry>();
  private _scafMat = new MeshLambertMaterial({ vertexColors: true });
  private _m = new Matrix4();
  private _q = new Quaternion();
  private _p = new Vector3();
  private _s = new Vector3();
  private _up = new Vector3(0, 1, 0);
  private _t = 0;

  constructor(scene: Scene, private _game: Game) {
    const unit = (w: number, h: number, d: number): BoxGeometry => new BoxGeometry(w, h, d).translate(0, h / 2, 0);
    this._slab = new InstancedMesh(unit(1, 1, 1), new MeshLambertMaterial({ color: 0x84878d }), MAX);
    this._frame = new InstancedMesh(unit(1, 1, 1), new MeshLambertMaterial({ color: 0xc9c2b4 }), MAX);
    this._mast = new InstancedMesh(unit(0.7, 1, 0.7), new MeshLambertMaterial({ color: 0xe5b73b }), MAX);
    this._head = new InstancedMesh(this._craneHead(), new MeshLambertMaterial({ vertexColors: true }), MAX);
    for (const m of [this._slab, this._frame, this._mast, this._head]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      scene.add(m);
    }
    scene.add(this._scaffolds);
  }

  /** Строительные леса вокруг здания: стойки, поперечины через каждые ~2 ед., диагональные связи и настил. */
  private _scaffold(w: number, d: number, h: number): BufferGeometry {
    const key = `${Math.round(w)}|${Math.round(d)}|${Math.ceil(h)}`;
    let geo = this._scafGeo.get(key);
    if (geo) return geo;
    const gb = new GeomBuilder();
    const hw = w / 2;
    const hd = d / 2;
    const top = Math.ceil(h);
    const steel = 0x9aa3ad;
    const wood = 0xb08a55;
    const nx = Math.max(1, Math.round(w / 3));
    const nz = Math.max(1, Math.round(d / 3));
    const pole = (x: number, z: number): void => void gb.box(0.2, top, 0.2, x, 0, z, steel);
    for (let i = 0; i <= nx; i++) for (const z of [-hd, hd]) pole(-hw + (w * i) / nx, z);
    for (let j = 1; j < nz; j++) for (const x of [-hw, hw]) pole(x, -hd + (d * j) / nz);
    for (let y = 1.6; y <= top; y += 2.2) {
      gb.box(w + 0.2, 0.14, 0.14, 0, y, -hd, steel).box(w + 0.2, 0.14, 0.14, 0, y, hd, steel);
      gb.box(0.14, 0.14, d + 0.2, -hw, y, 0, steel).box(0.14, 0.14, d + 0.2, hw, y, 0, steel);
      gb.box(w + 0.3, 0.1, 0.5, 0, y - 0.05, -hd - 0.3, wood).box(w + 0.3, 0.1, 0.5, 0, y - 0.05, hd + 0.3, wood);
    }
    const seg = Math.sqrt(w * w + 4 * 4);
    const ang = Math.atan2(4, w);
    for (let y = 0; y + 4 <= top; y += 4) {
      gb.box(seg, 0.1, 0.1, 0, y + 2, hd, steel, { rz: ang });
      gb.box(seg, 0.1, 0.1, 0, y + 2, -hd, steel, { rz: -ang });
    }
    geo = gb.build();
    this._scafGeo.set(key, geo);
    return geo;
  }


  /** Поворотная часть крана: стрела, противовес, кабина и оголовок. */
  private _craneHead(): BufferGeometry {
    return new GeomBuilder()
      .box(0.9, 1.6, 0.9, 0, 0, 0, 0xe5b73b)
      .box(15, 0.6, 0.6, 5.5, 1.6, 0, 0xe5b73b)
      .box(4, 0.7, 0.7, -3.5, 1.6, 0, 0xe5b73b)
      .box(2, 1.4, 1.2, -4.4, 0.4, 0, 0x6e7378)
      .box(1.2, 1.2, 1.2, 0.8, 0.5, 0.9, 0x4a6f93)
      .box(0.15, 4, 0.15, 10, -2.4, 0, 0x2b2f35)
      .box(0.7, 0.5, 0.7, 10, -2.9, 0, 0xc0392b)
      .box(0.15, 2.4, 0.15, 0, 2.2, 0, 0xe5b73b)
      .build();
  }

  private _putScaffold(i: number, b: Building, w: number, d: number, h: number): number {
    let mesh = this._scafPool[i];
    if (!mesh) {
      mesh = new Mesh(undefined, this._scafMat);
      mesh.castShadow = true;
      this._scaffolds.add(mesh);
      this._scafPool.push(mesh);
    }
    mesh.geometry = this._scaffold(w, d, h);
    mesh.position.set(b.x, 0.12, b.z);
    mesh.rotation.y = b.rot;
    mesh.visible = true;
    return i + 1;
  }

  /** Высота готового здания по габариту его модели (кэш по виду). */
  private _height(b: Building, wealth: number, mask: number): number {
    const g = this._game;
    const key = b.kind === 'zone' ? `${b.zone}:${b.level}:${b.variant}:${wealth}` : `${b.defId}:${mask}`;
    let h = this._heights.get(key);
    if (h === undefined) {
      const geo = b.kind === 'zone' ? zoneModel(b.zone, b.level, b.variant, wealth) : (() => {
        const def = g.services.require(b.defId);
        return serviceModel(def.model, def.size[0], def.size[1], installedUpgrades(def, mask).map((u) => u.id));
      })();
      geo.computeBoundingBox();
      h = Math.max(3, geo.boundingBox!.max.y);
      geo.dispose();
      this._heights.set(key, h);
    }
    return h;
  }

  update(realDt: number, simDt: number): void {
    this._t += simDt;
    void realDt;
    const list = this._game.get('construction').active;
    const cons = this._game.get('construction');
    let k = 0;
    let c = 0;
    let sc = 0;
    for (const b of list) {
      if (k >= MAX) break;
      const fresh = b.conKind === 0;
      const hNew = this._height(b, b.conKind === 1 ? b.conLevel : b.wealth, b.conKind === 2 ? b.conUp : b.up);
      const hOld = fresh ? 0 : this._height(b, b.wealth, b.up);
      const full = Math.max(hNew, hOld);
      this._q.setFromAxisAngle(this._up, b.rot);
      if (fresh) {
        // фундамент всегда, каркас растёт после foundationShare
        this._m.compose(this._p.set(b.x, 0.12, b.z), this._q, this._s.set(b.w + 0.6, 0.5, b.d + 0.6));
        this._slab.setMatrixAt(k, this._m);
        const fh = Math.max(0.01, hNew * cons.frameProgress(b));
        this._m.compose(this._p.set(b.x, 0.62, b.z), this._q, this._s.set(b.w * 0.92, fh, b.d * 0.92));
        this._frame.setMatrixAt(k, this._m);
        // леса поднимаются вместе с каркасом
        if (fh > 2) sc = this._putScaffold(sc, b, b.w + 1.2, b.d + 1.2, fh + 1.2);
      } else {
        // леса вокруг работающего здания (отдельная сетчатая модель, а не сплошная коробка)
        this._m.compose(this._p.set(b.x, 0.12, b.z), this._q, this._s.set(0.01, 0.01, 0.01));
        this._slab.setMatrixAt(k, this._m);
        this._frame.setMatrixAt(k, this._m);
        sc = this._putScaffold(sc, b, b.w + 1.4, b.d + 1.4, full + 0.8);
      }
      // кран в углу участка
      const cr = Math.cos(b.rot);
      const sr = Math.sin(b.rot);
      const lx = (b.w / 2 + 0.8) * 0.9;
      const lz = (b.d / 2 + 0.8) * 0.9;
      const cx = b.x + lx * cr + lz * sr;
      const cz = b.z - lx * sr + lz * cr;
      const mh = full + 5;
      const cs = Math.min(1, 0.45 + full / 22);
      this._m.compose(this._p.set(cx, 0.12, cz), this._q.identity(), this._s.set(cs, mh, cs));
      this._mast.setMatrixAt(k, this._m);
      this._q.setFromAxisAngle(this._up, this._t * 0.25 + b.id);
      this._m.compose(this._p.set(cx, 0.12 + mh, cz), this._q, this._s.set(cs, cs, cs));
      this._head.setMatrixAt(k, this._m);
      k++;
      c++;
    }
    void c;
    for (let i = sc; i < this._scafPool.length; i++) this._scafPool[i].visible = false;
    for (const m of [this._slab, this._frame, this._mast, this._head]) {
      m.count = k;
      m.instanceMatrix.needsUpdate = true;
    }
  }
}
