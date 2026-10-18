import { CELL } from '../config/constants';
import type { Game } from '../core/Game';
import type { System } from '../core/System';
import type { Prop } from '../core/types';
import { PROPS } from '../data/props';
import { obbDist } from '../world/geometry';
import { Terrain } from '../world/Terrain';

declare module '../core/Game' {
  interface SystemMap {
    props: PropSystem;
  }
}

/**
 * Природа, посаженная игроком: одиночные деревья и кисть с регулируемыми размером и густотой, кусты, цветы, камни.
 * Нельзя сажать в воду, на дороги, зоны и под здания; позже проложенная дорога или построенное здание убирает растения.
 */
export class PropSystem implements System {
  readonly id = 'props';
  readonly order = 90;
  private _game!: Game;
  private _buckets = new Map<number, Prop[]>();
  private _indexed = 0;
  private _timer = 0;
  private _graph = -1;
  private _zones = -1;
  private _world = -1;

  init(game: Game): void {
    this._game = game;
  }

  /** Заново строит индекс после загрузки. */
  rebuildIndex(): void {
    this._buckets.clear();
    this._indexed = 0;
    for (const p of this._game.world.props.values()) this._index(p);
  }

  /** Индекс отстаёт, если растения добавили в мир напрямую (загрузка сохранения). */
  private _sync(): void {
    if (this._indexed !== this._game.world.props.size) this.rebuildIndex();
  }

  private _key(x: number, z: number): number {
    return Math.floor(z / CELL) * 4096 + Math.floor(x / CELL);
  }

  private _index(p: Prop): void {
    const k = this._key(p.x, p.z);
    this._indexed++;
    const b = this._buckets.get(k);
    if (b) b.push(p);
    else this._buckets.set(k, [p]);
  }

  private _near(x: number, z: number, r: number): Prop[] {
    this._sync();
    const out: Prop[] = [];
    const c = Math.ceil(r / CELL);
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let dz = -c; dz <= c; dz++) {
      for (let dx = -c; dx <= c; dx++) {
        const b = this._buckets.get((cz + dz) * 4096 + cx + dx);
        if (b) for (const p of b) if (Math.hypot(p.x - x, p.z - z) <= r) out.push(p);
      }
    }
    return out;
  }

  get count(): number {
    return this._game.world.props.size;
  }

  /** Можно ли здесь что-то посадить (без учёта соседних растений). */
  isFree(x: number, z: number): boolean {
    const w = this._game.world;
    if (!w.inBounds(x, z, 2) || w.terrainAt(x, z) === Terrain.Water) return false;
    if (w.graph.clearance(x, z, 6) < 1.8) return false;
    for (const c of w.zones.near(x, z, CELL * 0.8)) if (c.zone || c.building) return false;
    for (const b of w.buildingsNear(x, z, 12)) if (obbDist(w.obbOf(b), { x, z }) < 1.5) return false;
    return true;
  }

  /** Посадить одно растение; null — место занято. */
  place(kind: string, x: number, z: number, scale?: number, rot?: number): Prop | null {
    const def = PROPS.find((d) => d.id === kind);
    if (!def || !this.isFree(x, z)) return null;
    const s = scale ?? def.scale[0] + Math.random() * (def.scale[1] - def.scale[0]);
    for (const q of this._near(x, z, def.spacing * 1.6)) {
      const qd = PROPS.find((d) => d.id === q.kind);
      if (Math.hypot(q.x - x, q.z - z) < Math.max(def.spacing * s, (qd?.spacing ?? 1) * q.s) * 0.55) return null;
    }
    const w = this._game.world;
    const p: Prop = { id: w.newId(), kind, x, z, s, rot: rot ?? Math.random() * Math.PI * 2 };
    w.props.set(p.id, p);
    this._index(p);
    return p;
  }

  /**
   * Кисть: до `count` растений в круге. Возвращает посаженные (деньги списывает вызывающий по числу).
   * `kinds` — из чего выбирать случайно (смешанный лес).
   */
  brush(kinds: string[], x: number, z: number, radius: number, count: number): Prop[] {
    const out: Prop[] = [];
    for (let i = 0; i < count * 2 && out.length < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * radius;
      const p = this.place(kinds[Math.floor(Math.random() * kinds.length)], x + Math.cos(a) * d, z + Math.sin(a) * d);
      if (p) out.push(p);
    }
    if (out.length) this._game.bus.emit('props:changed');
    return out;
  }

  /** Сколько растений ставит один мазок кисти данной густоты 1..3. */
  stampCount(radius: number, density: number): number {
    const area = (Math.PI * radius * radius) / (CELL * CELL);
    return Math.max(1, Math.round(area * [0.35, 0.8, 1.6][Math.min(2, Math.max(0, density - 1))]));
  }

  /** Ластик: стирает растения игрока и процедурные деревья в круге. Возвращает число стёртых растений игрока. */
  erase(x: number, z: number, r: number): number {
    const w = this._game.world;
    const hit = this._near(x, z, r);
    for (const p of hit) {
      w.props.delete(p.id);
      const b = this._buckets.get(this._key(p.x, p.z));
      if (b) b.splice(b.indexOf(p), 1);
      this._indexed--;
    }
    this._game.bus.emit('props:erase', { x, z, r });
    if (hit.length) this._game.bus.emit('props:changed');
    return hit.length;
  }

  update(_dt: number, realDt: number): void {
    const w = this._game.world;
    this._sync();
    this._timer += realDt;
    if (this._timer < 0.5 || (w.graph.version === this._graph && w.zones.version === this._zones && w.version === this._world)) return;
    this._timer = 0;
    this._graph = w.graph.version;
    this._zones = w.zones.version;
    this._world = w.version;
    let removed = 0;
    for (const p of [...w.props.values()]) {
      if (this.isFree(p.x, p.z)) continue;
      w.props.delete(p.id);
      const b = this._buckets.get(this._key(p.x, p.z));
      if (b) b.splice(b.indexOf(p), 1);
      this._indexed--;
      removed++;
    }
    if (removed) this._game.bus.emit('props:changed');
  }
}
