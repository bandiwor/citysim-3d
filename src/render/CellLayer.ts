import { DataTexture, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, RGBAFormat, Scene, SRGBColorSpace, UnsignedByteType } from 'three';
import { CELL } from '../world/World';

/** Полупрозрачный слой поверх карты: один пиксель текстуры = одна клетка (зоны, тепловые карты). */
export class CellLayer {
  readonly mesh: Mesh;
  readonly data: Uint8ClampedArray;
  private _tex: DataTexture;

  constructor(scene: Scene, readonly size: number, y: number, order: number) {
    this.data = new Uint8ClampedArray(size * size * 4);
    this._tex = new DataTexture(this.data as unknown as Uint8Array, size, size, RGBAFormat, UnsignedByteType);
    this._tex.magFilter = NearestFilter;
    this._tex.minFilter = NearestFilter;
    this._tex.colorSpace = SRGBColorSpace;
    this._tex.needsUpdate = true;
    const mat = new MeshBasicMaterial({ map: this._tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -order, polygonOffsetUnits: -order });
    this.mesh = new Mesh(new PlaneGeometry(size * CELL, size * CELL).rotateX(-Math.PI / 2), mat);
    this.mesh.position.set((size * CELL) / 2, y, (size * CELL) / 2);
    this.mesh.renderOrder = order;
    scene.add(this.mesh);
  }

  clear(): void {
    this.data.fill(0);
  }

  set(i: number, r: number, g: number, b: number, a: number): void {
    // строка 0 текстуры лежит на максимальном z плоскости: переворачиваем ряд, чтобы клетка (x, z) попадала на своё место
    const row = Math.floor(i / this.size);
    const k = ((this.size - 1 - row) * this.size + (i - row * this.size)) * 4;
    this.data[k] = r;
    this.data[k + 1] = g;
    this.data[k + 2] = b;
    this.data[k + 3] = a;
  }

  flush(): void {
    this._tex.needsUpdate = true;
  }
}
