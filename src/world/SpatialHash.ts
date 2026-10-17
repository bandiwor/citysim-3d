/** Равномерная сетка для быстрого поиска объектов по прямоугольнику (хранит числовые id). */
export class SpatialHash {
  private _cells = new Map<number, Set<number>>();
  private _keys = new Map<number, number[]>();

  constructor(readonly cellSize = 16) {}

  private _key(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096);
  }

  insert(id: number, minX: number, minZ: number, maxX: number, maxZ: number): void {
    this.remove(id);
    const s = this.cellSize;
    const keys: number[] = [];
    for (let cx = Math.floor(minX / s); cx <= Math.floor(maxX / s); cx++) {
      for (let cz = Math.floor(minZ / s); cz <= Math.floor(maxZ / s); cz++) {
        const k = this._key(cx, cz);
        let set = this._cells.get(k);
        if (!set) this._cells.set(k, (set = new Set()));
        set.add(id);
        keys.push(k);
      }
    }
    this._keys.set(id, keys);
  }

  remove(id: number): void {
    const keys = this._keys.get(id);
    if (!keys) return;
    for (const k of keys) {
      const set = this._cells.get(k);
      if (set) {
        set.delete(id);
        if (!set.size) this._cells.delete(k);
      }
    }
    this._keys.delete(id);
  }

  /** id объектов, чьи ячейки пересекают прямоугольник (возможны ложные срабатывания). */
  query(minX: number, minZ: number, maxX: number, maxZ: number, out: Set<number> = new Set()): Set<number> {
    const s = this.cellSize;
    for (let cx = Math.floor(minX / s); cx <= Math.floor(maxX / s); cx++) {
      for (let cz = Math.floor(minZ / s); cz <= Math.floor(maxZ / s); cz++) {
        const set = this._cells.get(this._key(cx, cz));
        if (set) for (const id of set) out.add(id);
      }
    }
    return out;
  }

  clear(): void {
    this._cells.clear();
    this._keys.clear();
  }
}
