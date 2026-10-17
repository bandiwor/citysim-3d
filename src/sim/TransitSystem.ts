import { effectiveDef } from '../data/services';
import type { Game } from '../core/Game';
import type { System } from '../core/System';
import type { Building, BusStop } from '../core/types';
import type { Vec2 } from '../world/geometry';
import type { PathStep } from './NetworkSystem';
import type { Vehicle } from './TrafficSystem';

declare module '../core/Game' {
  interface SystemMap {
    transit: TransitSystem;
  }
}

export type RouteStatus = 'ok' | 'short' | 'broken' | 'noDepot' | 'pending';

export interface TransitRoute {
  id: number;
  color: number;
  /** остановки по порядку (маршрут кольцевой: после последней — снова первая) */
  stops: number[];
  /** желаемое число автобусов */
  buses: number;
  /** участки пути: остановка k → остановка k+1 (null — пути нет) */
  legs: (PathStep[] | null)[];
  status: RouteStatus;
  /** перевезено пассажиров всего */
  carried: number;
  fleet: Vehicle[];
  /** линия маршрута по участкам для отрисовки */
  polyline: Vec2[][];
  /** версия расчёта путей (для отбрасывания устаревших ответов) */
  rev: number;
}

/** Состояние остановки: охват, спрос и очереди пассажиров по маршрутам и пунктам назначения. */
export interface StopInfo {
  pop: number;
  jobs: number;
  shops: number;
  /** маршрут → пункт назначения (id остановки) → ожидающих */
  waiting: Map<number, Map<number, number>>;
  total: number;
  acc: Map<number, number>;
  /** не уместились в очередь с начала месяца */
  unserved: number;
}

type Purpose = 'work' | 'shop' | 'home';

const bump = (x: number, c: number, w: number): number => Math.exp(-(((x - c) / w) ** 2));

/**
 * Общественный транспорт: остановки на дорогах, маршруты из остановок, депо с автобусами, пассажиры.
 * Спрос на остановках зависит от жителей поблизости и времени суток (утром — на работу, днём — по магазинам,
 * вечером — домой). Автобусы выезжают только из депо и ездят по кругу, загружая и высаживая людей.
 */
export class TransitSystem implements System {
  readonly id = 'transit';
  readonly order = 55;
  routes: TransitRoute[] = [];
  riders = 0;
  ridersMonth = 0;
  /** показывать линии маршрутов на карте */
  showRoutes = false;
  private _game!: Game;
  private _info = new Map<number, StopInfo>();
  private _nextRoute = 1;
  private _genAcc = 0;
  private _spawnAcc = 0;
  private _infoTimer = 99;
  private _netVersion = -1;
  private _dirty = true;
  private _served = new Map<number, number>();

  init(game: Game): void {
    this._game = game;
    game.bus.on('stops:changed', () => {
      this._dropMissingStops();
      this._dirty = true;
    });
    game.bus.on('time:month', () => {
      this.ridersMonth = 0;
      for (const i of this._info.values()) i.unserved = 0;
    });
  }

  get stops(): readonly BusStop[] {
    return this._game.world.stops;
  }

  // ---------- маршруты ----------

  routeById(id: number): TransitRoute | undefined {
    return this.routes.find((r) => r.id === id);
  }

  stopById(id: number): BusStop | undefined {
    return this._game.world.stops.find((s) => s.id === id);
  }

  createRoute(id?: number): TransitRoute {
    const colors = this._game.config.transit.routeColors;
    const rid = id ?? this._nextRoute++;
    if (rid >= this._nextRoute) this._nextRoute = rid + 1;
    const r: TransitRoute = { id: rid, color: colors[(rid - 1) % colors.length], stops: [], buses: 2, legs: [], status: 'short', carried: 0, fleet: [], polyline: [], rev: 0 };
    this.routes.push(r);
    this._dirty = true;
    this._changed();
    return r;
  }

  deleteRoute(id: number): void {
    const r = this.routeById(id);
    if (!r) return;
    for (const v of r.fleet) this._game.get('traffic').kill(v);
    this.routes = this.routes.filter((x) => x.id !== id);
    this._changed();
  }

  /** Добавляет остановку в конец маршрута. false — уже последняя или остановки нет. */
  addStop(routeId: number, stopId: number): boolean {
    const r = this.routeById(routeId);
    if (!r || !this.stopById(stopId) || r.stops[r.stops.length - 1] === stopId) return false;
    r.stops.push(stopId);
    this._routeEdited(r);
    return true;
  }

  removeStop(routeId: number, stopId: number): void {
    const r = this.routeById(routeId);
    if (!r) return;
    r.stops = r.stops.filter((s) => s !== stopId);
    this._routeEdited(r);
  }

  /** Убирает последнюю остановку маршрута. */
  popStop(routeId: number): void {
    const r = this.routeById(routeId);
    if (!r || !r.stops.length) return;
    r.stops.pop();
    this._routeEdited(r);
  }

  setBuses(routeId: number, n: number): void {
    const r = this.routeById(routeId);
    if (!r) return;
    r.buses = Math.max(0, Math.min(this._game.config.transit.maxBusesPerRoute, n));
    this._changed();
  }

  /** Ближайшая остановка к точке. */
  nearestStop(x: number, z: number, r: number): BusStop | null {
    let best: BusStop | null = null;
    let bd = r;
    for (const s of this._game.world.stops) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d <= bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  info(stopId: number): StopInfo {
    let i = this._info.get(stopId);
    if (!i) this._info.set(stopId, (i = { pop: 0, jobs: 0, shops: 0, waiting: new Map(), total: 0, acc: new Map(), unserved: 0 }));
    return i;
  }

  waitingAt(stopId: number): number {
    return this._info.get(stopId)?.total ?? 0;
  }

  /** Сколько людей ждёт на всех остановках маршрута. */
  waitingOnRoute(r: TransitRoute): number {
    let n = 0;
    for (const id of new Set(r.stops)) for (const q of [this._info.get(id)?.waiting.get(r.id)]) if (q) for (const v of q.values()) n += v;
    return n;
  }

  waitingTotal(): number {
    let n = 0;
    for (const i of this._info.values()) n += i.total;
    return n;
  }

  /** Первый живой автобус маршрута (для слежения камерой). */
  busOf(routeId: number): Vehicle | null {
    return this.routeById(routeId)?.fleet.find((v) => !v.dead) ?? null;
  }

  busesAlive(): number {
    return this.routes.reduce((n, r) => n + r.fleet.filter((v) => !v.dead).length, 0);
  }

  get buses(): Vehicle[] {
    return this.routes.flatMap((r) => r.fleet.filter((v) => !v.dead));
  }

  /** Доля поездок из точки, которую заберёт общественный транспорт (по остановкам действующих маршрутов). */
  share(x: number, z: number): number {
    const c = this._game.config.transit;
    if (!this._served.size) return 0;
    const r = c.stopRadius * 8;
    let cov = 0;
    for (const s of this._game.world.stops) {
      const q = this._served.get(s.id);
      if (!q) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < r) cov += (1 - d / r) * q;
    }
    return Math.min(c.shareMax * 1.5, Math.min(c.shareMax, Math.min(1, cov) * c.shareFactor) * this._game.get('mods').mul('transitShare'));
  }

  upkeep(): number {
    const c = this._game.config.economy;
    return this.stops.length * c.stopUpkeep + this.busesAlive() * c.busUpkeep;
  }

  /** Заработано билетами: учитывается экономикой при высадке. */
  private _earn(n: number): void {
    this.riders += n;
    this.ridersMonth += n;
    this._game.get('economy').earnTransit(n * this._game.config.economy.fare * this._game.get('mods').mul('fare'));
  }

  // ---------- внутренняя логика ----------

  private _changed(): void {
    this._game.bus.emit('routes:changed');
  }

  private _routeEdited(r: TransitRoute): void {
    for (const v of r.fleet) this._game.get('traffic').kill(v);
    r.fleet = [];
    r.legs = [];
    r.polyline = [];
    this._dirty = true;
    this._changed();
  }

  /** Удалённые остановки пропадают и из маршрутов. */
  private _dropMissingStops(): void {
    const ids = new Set(this._game.world.stops.map((s) => s.id));
    let changed = false;
    for (const r of this.routes) {
      const kept = r.stops.filter((id) => ids.has(id));
      if (kept.length !== r.stops.length) {
        r.stops = kept;
        this._routeEdited(r);
        changed = true;
      }
    }
    for (const id of [...this._info.keys()]) if (!ids.has(id)) this._info.delete(id);
    if (changed) this._changed();
  }

  update(dt: number, realDt: number): void {
    const net = this._game.get('network');
    if (net.version !== this._netVersion) {
      this._netVersion = net.version;
      this._dirty = true;
    }
    this._infoTimer += realDt;
    if (this._infoTimer > 3 || this._dirty) {
      this._infoTimer = 0;
      this._refreshInfo();
    }
    if (this._dirty) {
      this._dirty = false;
      this._recomputeRoutes();
    }
    if (dt <= 0) return;
    this._genAcc += dt;
    if (this._genAcc >= 1) {
      const step = this._genAcc;
      this._genAcc = 0;
      this._generate(step);
    }
    this._spawnAcc += dt;
    if (this._spawnAcc >= this._game.config.transit.spawnInterval) {
      this._spawnAcc = 0;
      this._maintainFleet();
    }
  }

  /** Охват остановок: жители, рабочие места и магазины поблизости. */
  private _refreshInfo(): void {
    const g = this._game;
    const radius = g.config.transit.stopRadius * 8;
    for (const s of g.world.stops) {
      const info = this.info(s.id);
      let pop = 0;
      let jobs = 0;
      let shops = 0;
      for (const b of g.world.buildingsNear(s.x, s.z, radius)) {
        const d = Math.hypot(b.x - s.x, b.z - s.z);
        if (d > radius || b.abandoned) continue;
        const w = 1 - (d / radius) * 0.5;
        if (g.zoneTypes.get(b.zone)?.housing) pop += b.pop * w;
        else {
          jobs += b.jobs * w;
          if (b.zone === 'com') shops += b.jobs * w;
        }
      }
      info.pop = pop;
      info.jobs = jobs;
      info.shops = shops;
    }
    // обслуживаемые остановки (есть маршрут с автобусами) для доли поездок
    this._served.clear();
    for (const r of this.routes) {
      const alive = r.fleet.filter((v) => !v.dead).length;
      if (r.status !== 'ok' || !alive) continue;
      const q = Math.min(1, alive / Math.max(1, r.buses));
      for (const id of r.stops) this._served.set(id, Math.max(this._served.get(id) ?? 0, q));
    }
  }

  /** Пересчитывает пути между остановками каждого маршрута (асинхронно). */
  private _recomputeRoutes(): void {
    const g = this._game;
    const net = g.get('network');
    const traffic = g.get('traffic');
    for (const r of this.routes) {
      r.rev++;
      const rev = r.rev;
      if (r.stops.length < 2) {
        r.status = 'short';
        r.legs = [];
        r.polyline = [];
        continue;
      }
      r.status = 'pending';
      const jobs = r.stops.map((id, k) => {
        const a = this.stopById(id);
        const b = this.stopById(r.stops[(k + 1) % r.stops.length]);
        return a && b && a.edge && b.edge ? net.requestPath(a.edge, a.s, b.edge, b.s) : Promise.resolve(null);
      });
      void Promise.all(jobs).then((legs) => {
        if (rev !== r.rev) return;
        r.legs = legs;
        r.status = legs.every((l) => l && l.length) ? 'ok' : 'broken';
        r.polyline = legs.map((l) => (l ? this._linePoints(l) : []));
        for (const v of r.fleet) traffic.kill(v);
        r.fleet = [];
        this._changed();
      });
    }
  }

  private _linePoints(steps: PathStep[]): Vec2[] {
    const graph = this._game.world.graph;
    const pts: Vec2[] = [];
    for (const s of steps) {
      const e = graph.edges.get(s.edge);
      if (!e) continue;
      const list = s.dir > 0 ? e.pts : [...e.pts].reverse();
      for (const p of list) pts.push({ x: p.x, z: p.z });
    }
    return pts;
  }

  private _phase(): string {
    const tod = this._game.get('time').tod;
    if (tod >= 0.25 && tod < 0.42) return 'morning';
    if (tod >= 0.42 && tod < 0.7) return 'day';
    if (tod >= 0.7 && tod < 0.88) return 'evening';
    return 'night';
  }

  /** Активность поездок по времени суток (часы пик утром и вечером). */
  activity(): number {
    const tod = this._game.get('time').tod;
    const c = this._game.config.traffic;
    return c.rushBase + c.rushAmp * Math.max(bump(tod, c.rushMorning, c.rushWidth), bump(tod, c.rushEvening, c.rushWidth));
  }

  /** Привлекательность остановки как цели поездки с заданной целью. */
  attractiveness(stopId: number, purpose: Purpose): number {
    const i = this._info.get(stopId);
    if (!i) return 1;
    return 1 + (purpose === 'work' ? i.jobs : purpose === 'shop' ? i.shops : i.pop);
  }

  /** Появляются новые пассажиры: цель зависит от времени суток, пункт назначения — от привлекательности остановок маршрута. */
  private _generate(dt: number): void {
    const c = this._game.config.transit;
    const mix = c.purposeMix[this._phase()];
    const act = this.activity();
    for (const stop of this._game.world.stops) {
      const info = this.info(stop.id);
      if (info.pop < 1) continue;
      const serving = this.routes.filter((r) => r.status === 'ok' && r.stops.includes(stop.id));
      if (!serving.length) continue;
      const rate = (info.pop * c.demandPerResident * act * dt) / serving.length;
      for (const r of serving) {
        let acc = (info.acc.get(r.id) ?? 0) + rate;
        while (acc >= 1) {
          acc -= 1;
          if (info.total >= c.maxWaiting) {
            info.unserved++;
            continue;
          }
          const purpose = this._pick(mix) as Purpose;
          const dest = this._destination(r, stop.id, purpose);
          if (dest === null) continue;
          let q = info.waiting.get(r.id);
          if (!q) info.waiting.set(r.id, (q = new Map()));
          q.set(dest, (q.get(dest) ?? 0) + 1);
          info.total++;
        }
        info.acc.set(r.id, acc);
      }
    }
  }

  private _pick(mix: Record<string, number>): string {
    let x = Math.random();
    for (const [k, w] of Object.entries(mix)) {
      x -= w;
      if (x <= 0) return k;
    }
    return 'home';
  }

  private _destination(r: TransitRoute, from: number, purpose: Purpose): number | null {
    const options = [...new Set(r.stops)].filter((id) => id !== from);
    if (!options.length) return null;
    const weights = options.map((id) => this.attractiveness(id, purpose));
    let x = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < options.length; i++) {
      x -= weights[i];
      if (x <= 0) return options[i];
    }
    return options[options.length - 1];
  }

  /** Депо, из которого можно выпустить автобус для маршрута (та же сеть дорог, есть свободное место). */
  depotFor(r: TransitRoute): Building | null {
    const g = this._game;
    const first = this.stopById(r.stops[0]);
    if (!first) return null;
    const net = g.get('network');
    const comp = net.compOfEdge(first.edge);
    let best: Building | null = null;
    let bd = Infinity;
    for (const f of g.get('fleet').facilities('bus')) {
      if (f.comp !== comp || comp < 0) continue;
      const cap = effectiveDef(g.services.require(f.defId), f.up).fleet?.count ?? 0;
      if (this._busesFrom(f.id) >= cap) continue;
      const d = Math.hypot(f.x - first.x, f.z - first.z);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  private _busesFrom(depotId: number): number {
    let n = 0;
    for (const r of this.routes) for (const v of r.fleet) if (!v.dead && v.data?.depot === depotId) n++;
    return n;
  }

  /** Выпускает недостающие автобусы из депо. */
  private _maintainFleet(): void {
    const g = this._game;
    const traffic = g.get('traffic');
    const net = g.get('network');
    for (const r of this.routes) {
      r.fleet = r.fleet.filter((v) => !v.dead);
      if (r.status !== 'ok' && r.status !== 'noDepot') continue;
      const first = this.stopById(r.stops[0]);
      if (!first) continue;
      const comp = net.compOfEdge(first.edge);
      const hasDepot = g.get('fleet').facilities('bus').some((f) => f.comp === comp);
      r.status = hasDepot ? 'ok' : 'noDepot';
      if (!hasDepot || r.fleet.length >= r.buses) continue;
      const depot = this.depotFor(r);
      if (!depot) continue;
      const rev = r.rev;
      // занимаем место заранее, чтобы не выпустить больше положенного
      const placeholder = { dead: false, data: { depot: depot.id } } as unknown as Vehicle;
      r.fleet.push(placeholder);
      void net.requestPath(depot.access, depot.accessS, first.edge, first.s).then((steps) => {
        r.fleet = r.fleet.filter((v) => v !== placeholder);
        if (rev !== r.rev) return;
        const bus = traffic.spawn(steps, depot.accessS, first.s, 'bus', r.color);
        if (!bus) return;
        bus.data = { route: r.id, k: 0, load: new Map<number, number>(), depot: depot.id };
        bus.onArrive = (v) => this._arrive(v);
        r.fleet.push(bus);
        this._changed();
      });
      break;
    }
  }

  /** Автобус прибыл на остановку: высадка, посадка и отправление на следующую. */
  private _arrive(v: Vehicle): boolean {
    const g = this._game;
    const traffic = g.get('traffic');
    const c = g.config.transit;
    const d = v.data as { route: number; k: number; load: Map<number, number> };
    const route = this.routeById(d.route);
    if (!route || route.status === 'broken' || route.stops.length < 2) return false;
    const stop = this.stopById(route.stops[d.k]);
    const nextIdx = (d.k + 1) % route.stops.length;
    const next = this.stopById(route.stops[nextIdx]);
    const leg = route.legs[d.k];
    if (!stop || !next || !leg) return false;

    const out = d.load.get(stop.id) ?? 0;
    d.load.delete(stop.id);
    let onboard = 0;
    for (const n of d.load.values()) onboard += n;
    const info = this.info(stop.id);
    const q = info.waiting.get(route.id);
    let boarded = 0;
    if (q) {
      for (const [dest, n] of q) {
        const take = Math.min(n, c.busCapacity - onboard - boarded);
        if (take <= 0) continue;
        d.load.set(dest, (d.load.get(dest) ?? 0) + take);
        q.set(dest, n - take);
        boarded += take;
      }
      info.total = Math.max(0, info.total - boarded);
    }
    if (out) {
      this._earn(out);
      route.carried += out;
    }
    if (out || boarded) g.sfx('bus');
    d.k = nextIdx;
    if (!traffic.reroute(v, leg.map((s) => ({ ...s })), stop.s, next.s)) return false;
    v.wait = c.busWait + (out + boarded) * 0.06;
    return true;
  }

  /** Пассажиров в автобусе. */
  loadOf(v: Vehicle): number {
    const load = v.data?.load as Map<number, number> | undefined;
    if (!load) return 0;
    let n = 0;
    for (const x of load.values()) n += x;
    return n;
  }
}
