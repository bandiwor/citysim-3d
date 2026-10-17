import type { Game } from '../core/Game';
import type { Building, Cell } from '../core/types';
import { BRIDGE_COST_MUL } from '../data/roads';
import { Terrain } from '../world/World';

export interface PlaceResult {
  ok: boolean;
  reason?: string;
}

/** Единственная точка изменения мира игроком/симуляцией: проверки, деньги, события. */
export class Builder {
  constructor(private _game: Game) {}

  // ---------- дороги ----------

  canRoad(x: number, y: number): boolean {
    const w = this._game.world;
    if (!w.inBounds(x, y)) return false;
    const i = w.idx(x, y);
    return w.terrain[i] !== Terrain.Blocked && w.occupant[i] === 0;
  }

  roadCost(x: number, y: number, typeId: string): number {
    const g = this._game;
    const w = g.world;
    const t = g.roadTypes.require(typeId);
    const i = w.idx(x, y);
    if (w.road[i] === t.index + 1) return 0;
    return t.cost * (w.terrain[i] === Terrain.Water ? BRIDGE_COST_MUL : 1);
  }

  placeRoads(cells: Cell[], typeId: string): PlaceResult {
    const g = this._game;
    const w = g.world;
    const t = g.roadTypes.require(typeId);
    const todo = cells.filter((c) => this.canRoad(c.x, c.y) && w.road[w.idx(c.x, c.y)] !== t.index + 1);
    if (!todo.length) return { ok: false };
    const cost = todo.reduce((s, c) => s + this.roadCost(c.x, c.y, typeId), 0);
    const eco = g.get('economy');
    if (!eco.spend(cost)) return { ok: false, reason: 'Недостаточно средств' };
    for (const c of todo) {
      const i = w.idx(c.x, c.y);
      w.road[i] = t.index + 1;
      w.zone[i] = 0;
    }
    g.bus.emit('roads:changed');
    g.bus.emit('zones:changed');
    return { ok: true };
  }

  // ---------- зоны ----------

  /** zoneId = null — убрать зонирование. */
  setZone(cells: Cell[], zoneId: string | null): PlaceResult {
    const g = this._game;
    const w = g.world;
    const z = zoneId ? g.zoneTypes.require(zoneId) : null;
    const todo = cells.filter((c) => {
      if (!w.inBounds(c.x, c.y)) return false;
      const i = w.idx(c.x, c.y);
      if (z) return w.terrain[i] === Terrain.Land && w.road[i] === 0 && w.occupant[i] === 0 && w.zone[i] !== z.index + 1;
      return w.zone[i] !== 0;
    });
    if (!todo.length) return { ok: false };
    const cost = z ? todo.length * z.cost : 0;
    if (!g.get('economy').spend(cost)) return { ok: false, reason: 'Недостаточно средств' };
    for (const c of todo) {
      const i = w.idx(c.x, c.y);
      w.zone[i] = z ? z.index + 1 : 0;
      if (!z) {
        const b = w.buildingAt(c.x, c.y);
        if (b && b.kind === 'zone') this.removeBuilding(b);
      }
    }
    g.bus.emit('zones:changed');
    return { ok: true };
  }

  // ---------- службы ----------

  canPlaceService(defId: string, x: number, y: number): PlaceResult {
    const g = this._game;
    const w = g.world;
    const def = g.services.require(defId);
    for (let dy = 0; dy < def.size[1]; dy++) {
      for (let dx = 0; dx < def.size[0]; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        if (!w.inBounds(cx, cy)) return { ok: false, reason: 'За пределами карты' };
        const i = w.idx(cx, cy);
        if (w.terrain[i] !== Terrain.Land) return { ok: false, reason: 'Неподходящий рельеф' };
        if (w.road[i] !== 0 || w.occupant[i] !== 0) return { ok: false, reason: 'Место занято' };
      }
    }
    if (def.needsRoad && this.findAccess(x, y, def.size[0], def.size[1]) < 0) {
      return { ok: false, reason: 'Нужна дорога рядом' };
    }
    return { ok: true };
  }

  placeService(defId: string, x: number, y: number): PlaceResult {
    const g = this._game;
    const def = g.services.require(defId);
    const check = this.canPlaceService(defId, x, y);
    if (!check.ok) return check;
    if (!g.get('economy').spend(def.cost)) return { ok: false, reason: 'Недостаточно средств' };
    const b = this.createBuilding('service', defId, x, y, def.size[0], def.size[1]);
    b.rot = Math.floor(Math.random() * 4);
    this.addBuilding(b);
    return { ok: true };
  }

  // ---------- остановки ----------

  placeStop(x: number, y: number): PlaceResult {
    const g = this._game;
    const w = g.world;
    if (!w.inBounds(x, y)) return { ok: false };
    const i = w.idx(x, y);
    if (w.road[i] === 0) return { ok: false, reason: 'Остановку можно ставить только на дорогу' };
    if (!g.roadTypes.at(w.road[i] - 1).access) return { ok: false, reason: 'Не на магистрали' };
    if (w.stop[i]) return { ok: false, reason: 'Здесь уже есть остановка' };
    if (!g.get('economy').spend(250)) return { ok: false, reason: 'Недостаточно средств' };
    w.stop[i] = 1;
    g.bus.emit('stops:changed');
    return { ok: true };
  }

  // ---------- снос ----------

  bulldoze(cells: Cell[]): void {
    const g = this._game;
    const w = g.world;
    let roads = false;
    let zones = false;
    let stops = false;
    for (const c of cells) {
      if (!w.inBounds(c.x, c.y)) continue;
      const i = w.idx(c.x, c.y);
      const b = w.buildingAt(c.x, c.y);
      if (b) this.removeBuilding(b);
      if (w.road[i]) {
        w.road[i] = 0;
        roads = true;
      }
      if (w.stop[i]) {
        w.stop[i] = 0;
        stops = true;
      }
      if (w.zone[i]) {
        w.zone[i] = 0;
        zones = true;
      }
    }
    if (roads) g.bus.emit('roads:changed');
    if (stops) g.bus.emit('stops:changed');
    if (zones || roads) g.bus.emit('zones:changed');
  }

  // ---------- здания ----------

  /** Клетка дороги (с access=true) рядом с прямоугольником, либо -1. */
  findAccess(x: number, y: number, bw: number, bh: number): number {
    const g = this._game;
    const w = g.world;
    const test = (cx: number, cy: number): number => {
      if (!w.inBounds(cx, cy)) return -1;
      const i = w.idx(cx, cy);
      const r = w.road[i];
      return r && g.roadTypes.at(r - 1).access ? i : -1;
    };
    for (let k = 0; k < bw; k++) {
      let r = test(x + k, y - 1);
      if (r >= 0) return r;
      r = test(x + k, y + bh);
      if (r >= 0) return r;
    }
    for (let k = 0; k < bh; k++) {
      let r = test(x - 1, y + k);
      if (r >= 0) return r;
      r = test(x + bw, y + k);
      if (r >= 0) return r;
    }
    return -1;
  }

  createBuilding(kind: 'zone' | 'service', defId: string, x: number, y: number, bw: number, bh: number): Building {
    const g = this._game;
    const b: Building = {
      id: g.world.newId(),
      kind,
      defId,
      zone: kind === 'zone' ? defId : '',
      level: 1,
      variant: Math.floor(Math.random() * 3),
      rot: Math.floor(Math.random() * 4),
      x,
      y,
      w: bw,
      h: bh,
      cell: g.world.idx(x, y),
      access: -1,
      comp: -1,
      pop: 0,
      cap: 0,
      jobs: 0,
      workers: 0,
      powerNeed: 0,
      waterNeed: 0,
      powerOut: 0,
      waterOut: 0,
      upkeep: 0,
      powered: false,
      watered: false,
      happiness: 0.5,
      goods: 0.5,
      abandoned: false,
      outage: 0,
      decay: 0,
      fire: 0,
    };
    this.applyStats(b);
    return b;
  }

  /** Пересчитывает вместимость/потребности по определению и уровню. */
  applyStats(b: Building): void {
    const g = this._game;
    if (b.kind === 'zone') {
      const z = g.zoneTypes.require(b.zone);
      const lv = z.levels[b.level - 1];
      b.cap = z.housing ? lv.capacity : 0;
      b.jobs = z.housing ? 0 : lv.capacity;
      const units = lv.capacity;
      b.powerNeed = units * z.powerPer;
      b.waterNeed = units * z.waterPer;
    } else {
      const d = g.services.require(b.defId);
      b.jobs = d.jobs;
      b.powerNeed = d.powerNeed;
      b.waterNeed = d.waterNeed;
      b.powerOut = d.provides?.power ?? 0;
      b.waterOut = d.provides?.water ?? 0;
      b.upkeep = d.upkeep;
      b.powered = d.powerNeed === 0;
      b.watered = d.waterNeed === 0;
    }
  }

  addBuilding(b: Building): void {
    const w = this._game.world;
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        const i = w.idx(b.x + dx, b.y + dy);
        w.occupant[i] = b.id;
        if (b.kind === 'service') w.zone[i] = 0;
      }
    }
    w.buildings.set(b.id, b);
    w.bumpId(b.id);
    w.version++;
    b.access = this.findAccess(b.x, b.y, b.w, b.h);
    this._game.bus.emit('building:added', b);
    if (b.kind === 'service') this._game.bus.emit('zones:changed');
  }

  removeBuilding(b: Building): void {
    const w = this._game.world;
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) w.occupant[w.idx(b.x + dx, b.y + dy)] = 0;
    }
    w.buildings.delete(b.id);
    w.version++;
    this._game.bus.emit('building:removed', b);
    this._game.bus.emit('zones:changed');
  }

  /** Меняет уровень здания (апгрейд/даунгрейд). */
  setLevel(b: Building, level: number): void {
    b.level = level;
    b.variant = Math.floor(Math.random() * 3);
    this.applyStats(b);
    this._game.bus.emit('building:updated', b);
  }
}
