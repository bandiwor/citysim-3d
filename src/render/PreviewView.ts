import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, RingGeometry, Vector3, type Scene } from 'three';
import type { PreviewRibbon, PreviewState } from '../core/Tool';

const OK = 0x4cd964;
const BAD = 0xff4d4d;
const MAX_QUADS = 3000;

/** Подсветка при строительстве: квадраты клеток/оснований, лента дороги, кольцо кисти, маркер привязки. */
export class PreviewView {
  private _quads: InstancedMesh;
  private _ribbon: Mesh;
  private _ring: Mesh;
  private _marker: Mesh;
  private _m = new Matrix4();
  private _q = new Quaternion();
  private _p = new Vector3();
  private _s = new Vector3();
  private _up = new Vector3(0, 1, 0);
  private _col = new Color();

  constructor(scene: Scene) {
    this._quads = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }), MAX_QUADS);
    this._quads.count = 0;
    this._quads.frustumCulled = false;
    this._quads.renderOrder = 5;
    this._ribbon = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, side: DoubleSide }));
    this._ribbon.frustumCulled = false;
    this._ribbon.renderOrder = 6;
    this._ring = new Mesh(new RingGeometry(0.96, 1, 48).rotateX(-Math.PI / 2), new MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }));
    this._ring.renderOrder = 6;
    this._marker = new Mesh(new RingGeometry(1.2, 2, 24).rotateX(-Math.PI / 2), new MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }));
    this._marker.renderOrder = 7;
    for (const o of [this._quads, this._ribbon, this._ring, this._marker]) scene.add(o);
    this._ring.visible = this._marker.visible = this._ribbon.visible = false;
  }

  apply(s: PreviewState): void {
    const n = Math.min(s.quads.length, MAX_QUADS);
    for (let i = 0; i < n; i++) {
      const q = s.quads[i];
      this._q.setFromAxisAngle(this._up, q.rot);
      this._m.compose(this._p.set(q.x, 0.35, q.z), this._q, this._s.set(q.w, 1, q.d));
      this._quads.setMatrixAt(i, this._m);
      this._quads.setColorAt(i, this._col.setHex(q.ok ? OK : BAD));
    }
    this._quads.count = n;
    this._quads.instanceMatrix.needsUpdate = true;
    if (this._quads.instanceColor) this._quads.instanceColor.needsUpdate = true;

    this._ribbon.visible = !!s.ribbon;
    if (s.ribbon) this._setRibbon(s.ribbon);

    this._ring.visible = !!s.ring;
    if (s.ring) {
      this._ring.position.set(s.ring.x, 0.4, s.ring.z);
      this._ring.scale.set(s.ring.r, 1, s.ring.r);
      (this._ring.material as MeshBasicMaterial).color.setHex(s.ring.ok ? 0xffffff : BAD);
    }
    this._marker.visible = !!s.marker;
    if (s.marker) {
      this._marker.position.set(s.marker.x, 0.45, s.marker.z);
      (this._marker.material as MeshBasicMaterial).color.setHex(s.marker.ok ? OK : BAD);
    }
  }

  private _setRibbon(r: PreviewRibbon): void {
    const pos: number[] = [];
    const n = r.pts.length;
    const side = (i: number, k: number): [number, number] => {
      const a = r.pts[Math.max(0, i - 1)];
      const b = r.pts[Math.min(n - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return [r.pts[i].x - ((b.z - a.z) / l) * r.hw * k, r.pts[i].z + ((b.x - a.x) / l) * r.hw * k];
    };
    for (let i = 0; i < n - 1; i++) {
      const [lx0, lz0] = side(i, -1);
      const [rx0, rz0] = side(i, 1);
      const [lx1, lz1] = side(i + 1, -1);
      const [rx1, rz1] = side(i + 1, 1);
      pos.push(lx0, 0.4, lz0, rx0, 0.4, rz0, rx1, 0.4, rz1, lx0, 0.4, lz0, rx1, 0.4, rz1, lx1, 0.4, lz1);
    }
    this._ribbon.geometry.dispose();
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this._ribbon.geometry = g;
    (this._ribbon.material as MeshBasicMaterial).color.setHex(r.ok ? OK : BAD);
  }

  clear(): void {
    this._quads.count = 0;
    this._ribbon.visible = this._ring.visible = this._marker.visible = false;
  }
}
