import { Color, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3, type Scene } from 'three';
import type { Game } from '../core/Game';
import { GeomBuilder } from './GeomBuilder';
import type { View } from './View';

const MAX = 700;

/** Прохожие (тело — цвет одежды, голова — отдельный меш) и люди на остановках. Фокус ставится из камеры / игрока. */
export class PedestrianView implements View {
  private _body: InstancedMesh;
  private _head: InstancedMesh;
  private _m = new Matrix4();
  private _q = new Quaternion();
  private _up = new Vector3(0, 1, 0);
  private _p = new Vector3();
  private _s = new Vector3(1, 1, 1);
  private _col = new Color();
  /** переопределяет фокус (первое лицо) */
  focusOverride: { x: number; z: number } | null = null;

  constructor(scene: Scene, private _game: Game, private _camTarget: () => { x: number; z: number; distance: number }) {
    const body = new GeomBuilder().cylinder(0.26, 0.3, 0.8, 0, 0.8, 0, 0xffffff, 6).cylinder(0.12, 0.12, 0.8, -0.12, 0, 0, 0x2b2f3a, 5).cylinder(0.12, 0.12, 0.8, 0.12, 0, 0, 0x2b2f3a, 5).build();
    const head = new GeomBuilder().sphere(0.2, 0, 1.78, 0, 0xe8c4a0).build();
    const mat = new MeshLambertMaterial({ vertexColors: true });
    this._body = new InstancedMesh(body, mat, MAX);
    this._head = new InstancedMesh(head, mat, MAX);
    this._body.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
    for (const m of [this._body, this._head]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      scene.add(m);
    }
  }

  update(): void {
    const g = this._game;
    const ped = g.get('pedestrians');
    const c = g.config.pedestrians;
    const cam = this._camTarget();
    // с большой высоты людей не видно — не симулируем
    ped.focus = this.focusOverride ?? (cam.distance < c.visibleZoom ? { x: cam.x, z: cam.z } : null);
    let k = 0;
    const place = (x: number, z: number, yaw: number, bob: number, color: number): void => {
      if (k >= MAX) return;
      const y = g.world.heightAt(x, z) + 0.15 + bob;
      this._q.setFromAxisAngle(this._up, yaw);
      this._m.compose(this._p.set(x, y, z), this._q, this._s);
      this._body.setMatrixAt(k, this._m);
      this._head.setMatrixAt(k, this._m);
      this._body.setColorAt(k, this._col.setHex(color));
      k++;
    };
    for (const w of ped.walkers) place(w.x, w.z, w.yaw, Math.abs(Math.sin(w.phase)) * 0.06, w.color);
    for (const s of ped.waiting()) {
      for (let i = 0; i < s.n; i++) place(s.x + (i % 4) * 0.55 - 0.8, s.z + Math.floor(i / 4) * 0.5, i * 1.3, 0, 0x4a7ab8 + i * 0x0a1203);
    }
    this._body.count = this._head.count = k;
    this._body.instanceMatrix.needsUpdate = this._head.instanceMatrix.needsUpdate = true;
    this._body.instanceColor!.needsUpdate = true;
  }
}
