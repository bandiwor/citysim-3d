export interface Identified {
  id: string;
}
export interface Indexed extends Identified {
  /** Порядковый номер в реестре (проставляется автоматически, используется в плотных массивах мира). */
  index: number;
}

/** Реестр данных: дороги, зоны, службы, оверлеи, кнопки панели… Новые механики регистрируют свои записи сюда. */
export class Registry<T extends Identified> {
  private _map = new Map<string, T>();
  private _list: T[] = [];

  add(item: T): this {
    if (this._map.has(item.id)) throw new Error(`Duplicate id: ${item.id}`);
    if ('index' in item) (item as unknown as Indexed).index = this._list.length;
    this._map.set(item.id, item);
    this._list.push(item);
    return this;
  }

  get(id: string): T | undefined {
    return this._map.get(id);
  }

  require(id: string): T {
    const v = this._map.get(id);
    if (!v) throw new Error(`Unknown id: ${id}`);
    return v;
  }

  has(id: string): boolean {
    return this._map.has(id);
  }

  /** Получить по порядковому номеру (индексы в массивах мира смещены на 1: 0 = «пусто»). */
  at(index: number): T {
    return this._list[index];
  }

  all(): readonly T[] {
    return this._list;
  }
}
