import { BoxGeometry, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, SphereGeometry, Vector3, type BufferGeometry, type Scene } from 'three';
import type { Game } from '../core/Game';
import { lookOf, type Look } from '../sim/looks';
import type { View } from './View';

const MAX = 700;

interface PartMesh {
  mesh: InstancedMesh;
  n: number;
}

/**
 * Прохожие с походкой: туловище, голова, волосы/шапка, две ноги и две руки качаются от фазы шага.
 * Разные типы людей (взрослые, дети, пожилые), цвета кожи/одежды, рюкзаки. Каждая часть — свой InstancedMesh.
 */
export class PedestrianView implements View {
  private _parts: Record<'torso' | 'head' | 'hair' | 'hat' | 'legL' | 'legR' | 'armL' | 'armR' | 'bag', PartMesh>;
  private _base = new Matrix4();
  private _m = new Matrix4();
  private _local = new Matrix4();
  private _q = new Quaternion();
  private _qr = new Quaternion();
  private _up = new Vector3(0, 1, 0);
  private _ax = new Vector3(1, 0, 0);
  private _p = new Vector3();
  private _s = new Vector3();
  private _one = new Vector3(1, 1, 1);
  private _col = new Color();
  /** переопределяет фокус (первое лицо) */
  focusOverride: { x: number; z: number } | null = null;

  constructor(scene: Scene, private _game: Game, private _camTarget: () => { x: number; z: number; distance: number }) {
    const mat = new MeshLambertMaterial();
    const limb = (w: number, h: number, d: number, _pivotY: number): BufferGeometry => new BoxGeometry(w, h, d).translate(0, -h / 2, 0);
    const mk = (geo: BufferGeometry, cap = MAX): PartMesh => {
      const mesh = new InstancedMesh(geo, mat, cap);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      scene.add(mesh);
      return { mesh, n: 0 };
    };
    this._parts = {
      torso: mk(new BoxGeometry(0.46, 0.62, 0.26).translate(0, 1.09, 0)),
      head: mk(new SphereGeometry(0.17, 8, 6).translate(0, 1.58, 0)),
      hair: mk(new BoxGeometry(0.34, 0.12, 0.36).translate(0, 1.7, -0.01)),
      hat: mk(new BoxGeometry(0.4, 0.11, 0.46).translate(0, 1.76, 0.02), 200),
      legL: mk(limb(0.17, 0.85, 0.2, 0.85)),
      legR: mk(limb(0.17, 0.85, 0.2, 0.85)),
      armL: mk(limb(0.12, 0.6, 0.14, 1.4)),
      armR: mk(limb(0.12, 0.6, 0.14, 1.4)),
      bag: mk(new BoxGeometry(0.3, 0.4, 0.16).translate(0, 1.12, -0.21), 300),
    };
  }

  private _person(x: number, z: number, yaw: number, seed: number, phase: number, moving: boolean, tourist = false): void {
    const g = this._game;
    const look: Look = lookOf(seed, tourist);
    const bob = moving ? Math.abs(Math.sin(phase)) * 0.045 * look.height : 0;
    const y = g.world.heightAt(x, z) + 0.15 + bob;
    const sc = look.height;
    this._q.setFromAxisAngle(this._up, yaw);
    this._base.compose(this._p.set(x, y, z), this._q, this._s.set(sc, sc, sc));
    // осанка пожилых: наклон корпуса вперёд
    const stoop = look.kind === 2 ? 0.14 : 0;
    const swing = moving ? Math.sin(phase) * (look.kind === 2 ? 0.45 : 0.7) : 0;
    const P = this._parts;
    this._putBody(P.torso, stoop, look.shirt);
    this._putBody(P.head, stoop, look.skin);
    if (!look.bald && !look.hat) this._putBody(P.hair, stoop, look.hair);
    if (look.hat) this._putBody(P.hat, stoop, look.hatColor);
    if (look.bag) this._putBody(P.bag, stoop, look.hatColor ^ 0x303030);
    this._putLimb(P.legL, swing, -0.12, look.pants, 0.85);
    this._putLimb(P.legR, -swing, 0.12, look.pants, 0.85);
    this._putLimb(P.armL, -swing * 0.8, -0.3, look.shirt, 1.4);
    this._putLimb(P.armR, swing * 0.8, 0.3, look.shirt, 1.4);
  }

  /** Часть корпуса: наклон вокруг бёдер. */
  private _putBody(part: PartMesh, stoop: number, color: number): void {
    if (part.n >= part.mesh.instanceMatrix.count) return;
    if (stoop) {
      this._qr.setFromAxisAngle(this._ax, stoop);
      this._local.compose(this._p.set(0, 0.85, 0), this._qr, this._one).multiply(this._m.makeTranslation(0, -0.85, 0));
      this._m.multiplyMatrices(this._base, this._local);
    } else this._m.copy(this._base);
    part.mesh.setMatrixAt(part.n, this._m);
    part.mesh.setColorAt(part.n, this._col.setHex(color));
    part.n++;
  }

  /** Конечность в шарнире pivotY, смещённая по X, качается вокруг оси X. */
  private _putLimb(part: PartMesh, swing: number, x: number, color: number, pivotY: number): void {
    if (part.n >= part.mesh.instanceMatrix.count) return;
    this._qr.setFromAxisAngle(this._ax, swing);
    this._local.compose(this._p.set(x, pivotY, 0), this._qr, this._one);
    this._m.multiplyMatrices(this._base, this._local);
    part.mesh.setMatrixAt(part.n, this._m);
    part.mesh.setColorAt(part.n, this._col.setHex(color));
    part.n++;
  }

  update(): void {
    const g = this._game;
    const ped = g.get('pedestrians');
    const c = g.config.pedestrians;
    const cam = this._camTarget();
    // с большой высоты людей не видно — не симулируем
    ped.focus = this.focusOverride ?? (cam.distance < c.visibleZoom ? { x: cam.x, z: cam.z } : null);
    for (const p of Object.values(this._parts)) p.n = 0;
    let total = 0;
    for (const w of ped.walkers) {
      if (total >= MAX) break;
      // в первом лице не рисуем людей вплотную к камере
      if (this.focusOverride && Math.hypot(w.x - this.focusOverride.x, w.z - this.focusOverride.z) < 1.4) continue;
      total++;
      this._person(w.x, w.z, w.yaw, w.seed, w.phase, true, w.tourist);
    }
    for (const s of ped.waiting()) {
      for (let i = 0; i < s.n && total < MAX; i++, total++) {
        const seed = s.id * 131 + i * 17;
        this._person(s.x + (i % 4) * 0.55 - 0.8, s.z + Math.floor(i / 4) * 0.5, i * 1.3, seed, 0, false);
      }
    }
    for (const p of Object.values(this._parts)) {
      p.mesh.count = p.n;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
  }
}
