import { CELL } from '../config/constants';
import { SpatialHash } from './SpatialHash';

/** Клетка зонирования, порождённая дорогой: ориентирована вдоль дороги, лицом (+Z) к ней. */
export interface ZoneCell {
  id: number;
  x: number;
  z: number;
  /** рыскание здания: локальная +Z смотрит на дорогу */
  rot: number;
  /** единичный вектор вдоль дороги */
  tx: number;
  tz: number;
  /** единичный вектор в сторону дороги */
  nx: number;
  nz: number;
  /** ряд от дороги (0 — первый) */
  row: number;
  /** индекс зоны + 1 (0 — без зоны) */
  zone: number;
  /** id здания на клетке (0 — пусто) */
  building: number;
  /** ребро доступа (0 — нет) */
  edge: number;
  /** позиция доступа на ребре */
  s: number;
}

export const CELL_HALF = CELL / 2;

/** Хранилище клеток зонирования с пространственным индексом. */
export class ZoneGrid {
  readonly cells = new Map<number, ZoneCell>();
  version = 0;
  private _hash = new SpatialHash(CELL * 2);
  private _next = 1;
  private _list: ZoneCell[] = [];
  private _listVersion = -1;

  add(c: Omit<ZoneCell, 'id'>, id?: number): ZoneCell {
    const cell: ZoneCell = { ...c, id: id ?? this._next++ };
    if (cell.id >= this._next) this._next = cell.id + 1;
    this.cells.set(cell.id, cell);
    this._hash.insert(cell.id, cell.x - CELL, cell.z - CELL, cell.x + CELL, cell.z + CELL);
    this.version++;
    return cell;
  }

  remove(id: number): void {
    if (!this.cells.delete(id)) return;
    this._hash.remove(id);
    this.version++;
  }

  /** Клетки с центром в радиусе r от точки. */
  near(x: number, z: number, r: number): ZoneCell[] {
    const out: ZoneCell[] = [];
    for (const id of this._hash.query(x - r, z - r, x + r, z + r)) {
      const c = this.cells.get(id);
      if (c && Math.hypot(c.x - x, c.z - z) <= r) out.push(c);
    }
    return out;
  }

  list(): readonly ZoneCell[] {
    if (this._listVersion !== this.version) {
      this._list = [...this.cells.values()];
      this._listVersion = this.version;
    }
    return this._list;
  }

  clear(): void {
    this.cells.clear();
    this._hash.clear();
    this.version++;
  }
}
