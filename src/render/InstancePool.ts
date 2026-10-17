import { Color, InstancedBufferAttribute, InstancedMesh, Matrix4, type BufferGeometry, type Material } from 'three';

/** InstancedMesh с ключами: добавление/удаление/обновление экземпляров по числовому ключу за O(1). */
export class InstancePool {
  readonly mesh: InstancedMesh;
  private _owners: number[] = [];
  private _slot = new Map<number, number>();
  private _tmp = new Matrix4();
  private _col = new Color();

  constructor(geometry: BufferGeometry, material: Material, readonly capacity: number, shadows = true) {
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadows;
    this.mesh.receiveShadow = shadows;
  }

  get count(): number {
    return this._owners.length;
  }

  has(key: number): boolean {
    return this._slot.has(key);
  }

  set(key: number, matrix: Matrix4, color?: number): void {
    let s = this._slot.get(key);
    if (s === undefined) {
      if (this._owners.length >= this.capacity) return;
      s = this._owners.length;
      this._owners.push(key);
      this._slot.set(key, s);
      this.mesh.count = this._owners.length;
      this.mesh.instanceColor!.needsUpdate = true;
    }
    this.mesh.setMatrixAt(s, matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (color !== undefined) {
      this.mesh.setColorAt(s, this._col.setHex(color));
      this.mesh.instanceColor!.needsUpdate = true;
    }
  }

  setColor(key: number, color: number): void {
    const s = this._slot.get(key);
    if (s === undefined) return;
    this.mesh.setColorAt(s, this._col.setHex(color));
    this.mesh.instanceColor!.needsUpdate = true;
  }

  remove(key: number): void {
    const s = this._slot.get(key);
    if (s === undefined) return;
    const last = this._owners.length - 1;
    if (s !== last) {
      const lastKey = this._owners[last];
      this.mesh.getMatrixAt(last, this._tmp);
      this.mesh.setMatrixAt(s, this._tmp);
      this.mesh.getColorAt(last, this._col);
      this.mesh.setColorAt(s, this._col);
      this._owners[s] = lastKey;
      this._slot.set(lastKey, s);
    }
    this._owners.pop();
    this._slot.delete(key);
    this.mesh.count = this._owners.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }

  clear(): void {
    this._owners.length = 0;
    this._slot.clear();
    this.mesh.count = 0;
  }
}
