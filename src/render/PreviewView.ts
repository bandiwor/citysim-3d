import { InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Color, type Scene } from 'three';
import type { PreviewCell } from '../core/Tool';
import { CELL } from '../world/World';

/** Подсветка клеток при строительстве: зелёная — можно, красная — нельзя. */
export class PreviewView {
  private _mesh: InstancedMesh;
  private _m = new Matrix4();
  private _ok = new Color(0x4cd964);
  private _bad = new Color(0xff4d4d);

  constructor(scene: Scene) {
    this._mesh = new InstancedMesh(
      new PlaneGeometry(CELL - 0.3, CELL - 0.3).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }),
      3000,
    );
    this._mesh.count = 0;
    this._mesh.frustumCulled = false;
    this._mesh.renderOrder = 5;
    scene.add(this._mesh);
  }

  set(cells: PreviewCell[]): void {
    const n = Math.min(cells.length, 3000);
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      this._m.makeTranslation((c.x + 0.5) * CELL, 0.3, (c.y + 0.5) * CELL);
      this._mesh.setMatrixAt(i, this._m);
      this._mesh.setColorAt(i, c.ok ? this._ok : this._bad);
    }
    this._mesh.count = n;
    this._mesh.instanceMatrix.needsUpdate = true;
    if (this._mesh.instanceColor) this._mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this._mesh.count = 0;
  }
}
