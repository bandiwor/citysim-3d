import type { Game } from '../core/Game';
import type { System } from '../core/System';
import type { Building } from '../core/types';
import { CELL } from '../world/World';

declare module '../core/Game' {
  interface SystemMap {
    traffic: TrafficSystem;
  }
}

export type VehicleKind = 'car' | 'truck' | 'bus';

export interface Vehicle {
  id: number;
  kind: VehicleKind;
  path: number[];
  /** индекс текущей клетки пути */
  i: number;
  /** прогресс внутри клетки 0..1 */
  t: number;
  x: number;
  z: number;
  yaw: number;
  color: number;
  speedMul: number;
  /** секунд ожидания (остановка) */
  wait: number;
  dead: boolean;
  /** Вызывается по прибытии. Вернуть true, если машине назначен новый путь; иначе она исчезает. */
  onArrive?: (v: Vehicle) => boolean;
  // кривая текущего сегмента (квадратичный Безье)
  p0x: number;
  p0z: number;
  cx: number;
  cz: number;
  p1x: number;
  p1z: number;
}

interface PendingTrip {
  at: number;
  from: Building;
  to: Building;
  color: number;
}

const CAR_COLORS = [0xd94b4b, 0x3f7fd9, 0xe8e8e8, 0x2b2b2e, 0xf0c33c, 0x4aa86b, 0x8a8f98, 0xb36bd1, 0xe98a3a];

/** Автомобили, грузовики и автобусы: поиск пути, движение по кривым, пробки. */
export class TrafficSystem implements System {
  readonly id = 'traffic';
  readonly order = 50;
  vehicles: Vehicle[] = [];
  occupancy = new Uint16Array(0);
  /** средняя относительная скорость 0..1 */
  flow = 1;
  maxVehicles = 420;
  private _game!: Game;
  private _nextId = 1;
  private _acc = 0;
  private _truckAcc = 0;
  private _clock = 0;
  private _pending: PendingTrip[] = [];
  private _homes: Building[] = [];
  private _works: Building[] = [];
  private _shops: Building[] = [];
  private _inds: Building[] = [];
  private _listVersion = -1;
  private _roadsDirty = false;

  init(game: Game): void {
    this._game = game;
    this.occupancy = new Uint16Array(game.world.cells);
    game.get('network').occupancy = this.occupancy;
    game.bus.on('roads:changed', () => (this._roadsDirty = true));
  }

  update(dt: number): void {
    if (this._roadsDirty) this._validate();
    if (dt <= 0) return;
    this._clock += dt;
    this._refreshLists();
    this._spawnTrips(dt);
    this._spawnTrucks(dt);
    this._flushPending();
    this._move(dt);
  }

  /** Создаёт машину на пути. Возвращает null, если путь слишком короткий или лимит исчерпан. */
  spawn(path: number[] | null, kind: VehicleKind, color?: number): Vehicle | null {
    if (!path || path.length < 2 || this.vehicles.length >= this.maxVehicles + (kind === 'bus' ? 40 : 0)) return null;
    const v: Vehicle = {
      id: this._nextId++,
      kind,
      path,
      i: 0,
      t: 0.5,
      x: 0,
      z: 0,
      yaw: 0,
      color: color ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      speedMul: kind === 'bus' ? 0.85 : kind === 'truck' ? 0.8 : 0.9 + Math.random() * 0.2,
      wait: 0,
      dead: false,
      p0x: 0,
      p0z: 0,
      cx: 0,
      cz: 0,
      p1x: 0,
      p1z: 0,
    };
    this.occupancy[path[0]]++;
    this._enter(v);
    this._place(v);
    this.vehicles.push(v);
    return v;
  }

  /** Назначает уже существующей машине новый путь (для автобусов). */
  reroute(v: Vehicle, path: number[] | null): boolean {
    if (!path || path.length < 2) return false;
    this.occupancy[v.path[v.i]] = Math.max(0, this.occupancy[v.path[v.i]] - 1);
    v.path = path;
    v.i = 0;
    v.t = 0.5;
    this.occupancy[path[0]]++;
    this._enter(v);
    return true;
  }

  kill(v: Vehicle): void {
    if (v.dead) return;
    v.dead = true;
    const c = v.path[v.i];
    if (this.occupancy[c] > 0) this.occupancy[c]--;
  }

  // ---------- генерация поездок ----------

  private _refreshLists(): void {
    const w = this._game.world;
    if (this._listVersion === w.version) return;
    this._listVersion = w.version;
    this._homes = [];
    this._works = [];
    this._shops = [];
    this._inds = [];
    for (const b of w.list()) {
      if (b.abandoned || b.access < 0) continue;
      if (b.zone === 'res') this._homes.push(b);
      else if (b.jobs > 0) {
        this._works.push(b);
        if (b.zone === 'com') this._shops.push(b);
        if (b.zone === 'ind') this._inds.push(b);
      }
    }
  }

  private _spawnTrips(dt: number): void {
    const pop = this._game.get('stats').population;
    if (pop < 15 || !this._homes.length || !this._works.length) return;
    const tod = this._game.get('time').tod;
    const bump = Math.max(Math.exp(-(((tod - 0.33) / 0.06) ** 2)), Math.exp(-(((tod - 0.72) / 0.06) ** 2)));
    this._acc += pop * 0.0045 * (0.5 + 0.9 * bump) * dt;
    let guard = 4;
    while (this._acc >= 1 && guard-- > 0) {
      this._acc -= 1;
      this._newTrip();
    }
    if (this._acc > 3) this._acc = 0;
  }

  private _newTrip(): void {
    const g = this._game;
    const home = this._homes[Math.floor(Math.random() * this._homes.length)];
    if (home.pop < 1 || !home.powered) return;
    const pool = Math.random() < 0.35 && this._shops.length ? this._shops : this._works;
    const dest = pool[Math.floor(Math.random() * pool.length)];
    if (!dest || dest.comp !== home.comp || dest.comp < 0) return;
    const transit = g.get('transit');
    if (Math.random() < transit.share(home.cell)) {
      transit.rider();
      return;
    }
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const v = this.spawn(g.get('network').findPath(home.access, dest.access), 'car', color);
    if (!v) return;
    v.onArrive = () => {
      this._pending.push({ at: this._clock + 3 + Math.random() * 9, from: dest, to: home, color });
      return false;
    };
  }

  private _flushPending(): void {
    if (!this._pending.length) return;
    const net = this._game.get('network');
    const keep: PendingTrip[] = [];
    for (const p of this._pending) {
      if (p.at > this._clock) keep.push(p);
      else if (this._game.world.buildings.has(p.from.id) && this._game.world.buildings.has(p.to.id)) {
        this.spawn(net.findPath(p.from.access, p.to.access), 'car', p.color);
      }
    }
    this._pending = keep;
  }

  private _spawnTrucks(dt: number): void {
    if (!this._inds.length || !this._shops.length) return;
    this._truckAcc += dt * Math.min(1.2, this._inds.length * 0.05);
    if (this._truckAcc < 1) return;
    this._truckAcc = 0;
    const from = this._inds[Math.floor(Math.random() * this._inds.length)];
    let best: Building | null = null;
    for (let k = 0; k < 5; k++) {
      const c = this._shops[Math.floor(Math.random() * this._shops.length)];
      if (c.comp === from.comp && (!best || c.goods < best.goods)) best = c;
    }
    if (!best) return;
    const target = best;
    const v = this.spawn(this._game.get('network').findPath(from.access, target.access), 'truck', 0xf2f2f2);
    if (v) {
      v.onArrive = () => {
        target.goods = Math.min(1, target.goods + 0.4);
        return false;
      };
    }
  }

  // ---------- движение ----------

  private _move(dt: number): void {
    const w = this._game.world;
    let flowSum = 0;
    let flowN = 0;
    for (const v of this.vehicles) {
      if (v.dead) continue;
      if (v.wait > 0) {
        v.wait -= dt;
        continue;
      }
      const c = v.path[v.i];
      const r = w.road[c];
      if (!r) {
        this.kill(v);
        continue;
      }
      const type = this._game.roadTypes.at(r - 1);
      const k = this.occupancy[c] / type.capacity;
      const f = 1 / (1 + k * k * 2.2);
      flowSum += f;
      flowN++;
      v.t += (type.speed * f * v.speedMul * dt) / CELL;
      const last = v.i === v.path.length - 1;
      if ((last && v.t >= 0.5) || v.t >= 1) {
        if (last) {
          const again = v.onArrive?.(v) ?? false;
          if (!again) this.kill(v);
          continue;
        }
        this.occupancy[c]--;
        v.i++;
        v.t = Math.max(0, v.t - 1);
        this.occupancy[v.path[v.i]]++;
        this._enter(v);
      }
      this._place(v);
    }
    this.vehicles = this.vehicles.filter((v) => !v.dead);
    const target = flowN ? flowSum / flowN : 1;
    this.flow += (target - this.flow) * Math.min(1, dt * 0.5);
  }

  /** Строит кривую прохождения текущей клетки пути. */
  private _enter(v: Vehicle): void {
    const w = this._game.world;
    const n = w.size;
    const path = v.path;
    const i = v.i;
    const c = path[i];
    const cx = ((c % n) + 0.5) * CELL;
    const cz = (((c / n) | 0) + 0.5) * CELL;
    const dir = (a: number, b: number): [number, number] => {
      const dx = (b % n) - (a % n);
      const dz = ((b / n) | 0) - ((a / n) | 0);
      return [Math.sign(dx), Math.sign(dz)];
    };
    let din: [number, number];
    let dout: [number, number];
    if (i > 0) din = dir(path[i - 1], c);
    else din = dir(c, path[1]);
    if (i < path.length - 1) dout = dir(c, path[i + 1]);
    else dout = din;
    const r = w.road[c];
    const lane = r ? this._game.roadTypes.at(r - 1).laneOffset : 1.3;
    const pin: [number, number] = [-din[1], din[0]];
    const pout: [number, number] = [-dout[1], dout[0]];
    const dot = din[0] * dout[0] + din[1] * dout[1];
    const kk = dot > -0.5 ? 1 / (1 + dot) : 0;
    v.p0x = cx - (din[0] * CELL) / 2 + pin[0] * lane;
    v.p0z = cz - (din[1] * CELL) / 2 + pin[1] * lane;
    v.p1x = cx + (dout[0] * CELL) / 2 + pout[0] * lane;
    v.p1z = cz + (dout[1] * CELL) / 2 + pout[1] * lane;
    v.cx = cx + (pin[0] + pout[0]) * lane * kk;
    v.cz = cz + (pin[1] + pout[1]) * lane * kk;
  }

  private _place(v: Vehicle): void {
    const t = Math.min(1, v.t);
    const u = 1 - t;
    v.x = u * u * v.p0x + 2 * u * t * v.cx + t * t * v.p1x;
    v.z = u * u * v.p0z + 2 * u * t * v.cz + t * t * v.p1z;
    const dx = 2 * u * (v.cx - v.p0x) + 2 * t * (v.p1x - v.cx);
    const dz = 2 * u * (v.cz - v.p0z) + 2 * t * (v.p1z - v.cz);
    if (dx !== 0 || dz !== 0) {
      const target = Math.atan2(-dz, dx);
      let d = target - v.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      v.yaw += d * 0.35;
    }
  }

  /** После изменения дорог убираем машины на исчезнувших клетках и пересчитываем занятость. */
  private _validate(): void {
    this._roadsDirty = false;
    const w = this._game.world;
    this.occupancy.fill(0);
    for (const v of this.vehicles) {
      if (v.dead) continue;
      let ok = true;
      for (let k = v.i; k < v.path.length; k++) {
        if (!w.road[v.path[k]]) {
          ok = false;
          break;
        }
      }
      if (!ok) v.dead = true;
      else this.occupancy[v.path[v.i]]++;
    }
    this.vehicles = this.vehicles.filter((v) => !v.dead);
  }

  /** Часы симуляции в секундах (для отложенных событий). */
  get clock(): number {
    return this._clock;
  }
}
