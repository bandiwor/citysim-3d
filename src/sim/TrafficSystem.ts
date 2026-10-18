import { isIdle } from '../core/types';
import type { Game } from '../core/Game';
import type { System } from '../core/System';
import type { Building } from '../core/types';
import type { PathStep } from './NetworkSystem';
import type { RoadEdge } from '../world/RoadGraph';
import { lightGroups, lightState } from './lights';

declare module '../core/Game' {
  interface SystemMap {
    traffic: TrafficSystem;
  }
}

export type VehicleKind = 'car' | 'truck' | 'bus' | 'police' | 'garbage' | 'hearse';

export interface Vehicle {
  id: number;
  kind: VehicleKind;
  steps: PathStep[];
  /** ревизии рёбер на момент прокладки пути */
  revs: number[];
  /** индекс текущего шага */
  i: number;
  /** положение на текущем ребре (длина дуги от начала ребра) */
  s: number;
  /** где остановиться на последнем ребре */
  endS: number;
  x: number;
  z: number;
  yaw: number;
  /** сглаживающее смещение после смены ребра */
  ox: number;
  oz: number;
  color: number;
  speedMul: number;
  /** секунд ожидания (остановка/расчёт пути) */
  wait: number;
  /** возраст, секунд */
  age: number;
  dead: boolean;
  /** Вызывается по прибытии. Вернуть true, если машина продолжает жить (ей назначен новый путь). */
  onArrive?: (v: Vehicle) => boolean;
  /** произвольные данные владельца (маршрут автобуса, груз…) */
  data?: Record<string, unknown>;
  /** где остановиться из-за красного/очереди на текущем ребре (undefined — свободно) */
  stopS?: number;
  /** расстояние от начала полосы (для порядка машин) */
  p: number;
  /** узел перекрёстка, на проезд которого машина заняла место, и её группа подхода */
  jn?: number;
  jg?: string;
  /** подход (ребро:направление) и признак левого поворота */
  ja?: string;
  jl?: boolean;
  /** сколько секунд ждёт разрешения въехать на перекрёсток */
  jwait: number;
  /** замедление в повороте 0..1 */
  slow: number;
}

interface PendingTrip {
  at: number;
  from: Building;
  to: Building;
  color: number;
}

const CAR_COLORS = [0xd94b4b, 0x3f7fd9, 0xe8e8e8, 0x2b2b2e, 0xf0c33c, 0x4aa86b, 0x8a8f98, 0xb36bd1, 0xe98a3a];
const rnd = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

/** Автомобили, грузовики и автобусы: движение по рёбрам графа, асинхронный поиск пути в воркере, пробки. */
export class TrafficSystem implements System {
  readonly id = 'traffic';
  readonly order = 50;
  vehicles: Vehicle[] = [];
  /** число машин на ребре (id ребра → n) */
  occupancy = new Map<number, number>();
  /** средняя относительная скорость 0..1 */
  flow = 1;
  private _game!: Game;
  private _nextId = 1;
  private _acc = 0;
  private _truckAcc = 0;
  private _clock = 0;
  private _syncAcc = 0;
  private _pending: PendingTrip[] = [];
  private _requests = 0;
  private _homes: Building[] = [];
  private _works: Building[] = [];
  private _shops: Building[] = [];
  private _inds: Building[] = [];
  private _listVersion = -1;
  private _graphVersion = -1;
  private _groups = new Map<number, Map<number, 0 | 1>>();
  private _groupsVersion = -1;
  private _load = new Map<number, number>();

  init(game: Game): void {
    this._game = game;
  }

  get clock(): number {
    return this._clock;
  }

  update(dt: number, realDt: number): void {
    const graph = this._game.world.graph;
    if (graph.version !== this._graphVersion) {
      this._graphVersion = graph.version;
      this._validate();
    }
    this._syncAcc += realDt;
    if (this._syncAcc >= this._game.config.traffic.occupancySync) {
      this._syncAcc = 0;
      this._game.get('network').syncOccupancy(this.occupancy);
    }
    if (dt <= 0) return;
    this._clock += dt;
    this._refreshLists();
    this._spawnTrips(dt);
    this._spawnTrucks(dt);
    this._flushPending();
    this._move(dt);
  }

  /** Загрузка ребра: машин / вместимость. */
  load(edgeId: number): number {
    const e = this._game.world.graph.edges.get(edgeId);
    if (!e) return 0;
    return (this.occupancy.get(edgeId) ?? 0) / this._game.get('network').capacityOf(e);
  }

  /** Создаёт машину на пути. null — путь пуст или лимит исчерпан. */
  spawn(steps: PathStep[] | null, fromS: number, endS: number, kind: VehicleKind, color?: number): Vehicle | null {
    const c = this._game.config.traffic;
    if (!steps || !steps.length) return null;
    const pop = this._game.get('stats').population;
    const cap = kind === 'car' || kind === 'truck' ? Math.min(c.maxVehicles, 10 + pop * c.carsPerPop) : c.maxVehicles + c.busExtra;
    if (this.vehicles.length >= cap) return null;
    const graph = this._game.world.graph;
    if (steps.some((s) => !graph.edges.has(s.edge))) return null;
    // место на полосе занято: не появляемся внутри другой машины
    const e0 = graph.edges.get(steps[0].edge)!;
    const p0 = steps[0].dir > 0 ? fromS : e0.len - fromS;
    for (const o of this.vehicles) {
      const os = o.steps[o.i];
      if (!o.dead && os.edge === steps[0].edge && os.dir === steps[0].dir && Math.abs(o.p - p0) < this._gap(o.kind, kind)) return null;
    }
    const [lo, hi] = c.speedMul[kind] ?? [1, 1];
    const v: Vehicle = {
      id: this._nextId++,
      kind,
      steps,
      revs: steps.map((s) => graph.edges.get(s.edge)!.rev),
      i: 0,
      s: fromS,
      endS,
      x: 0,
      z: 0,
      yaw: 0,
      ox: 0,
      oz: 0,
      color: color ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      speedMul: rnd(lo, hi),
      wait: 0,
      age: 0,
      dead: false,
      p: p0,
      jwait: 0,
      slow: 1,
    };
    this._occ(steps[0].edge, 1);
    this._place(v, true);
    this.vehicles.push(v);
    return v;
  }

  /** Назначает существующей машине новый путь (автобусы). */
  reroute(v: Vehicle, steps: PathStep[] | null, fromS: number, endS: number): boolean {
    if (!steps || !steps.length) return false;
    const graph = this._game.world.graph;
    if (steps.some((s) => !graph.edges.has(s.edge))) return false;
    this._occ(v.steps[v.i].edge, -1);
    v.steps = steps;
    v.revs = steps.map((s) => graph.edges.get(s.edge)!.rev);
    v.i = 0;
    v.s = fromS;
    v.endS = endS;
    v.wait = 0;
    this._occ(steps[0].edge, 1);
    this._place(v, true);
    return true;
  }

  kill(v: Vehicle): void {
    if (v.dead) return;
    v.dead = true;
    const step = v.steps[v.i];
    if (step) this._occ(step.edge, -1);
  }

  private _occ(edge: number, d: number): void {
    const n = (this.occupancy.get(edge) ?? 0) + d;
    if (n <= 0) this.occupancy.delete(edge);
    else this.occupancy.set(edge, n);
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
      if (isIdle(b) || !b.access) continue;
      if (this._game.zoneTypes.get(b.zone)?.housing) this._homes.push(b);
      else if (b.jobs > 0) {
        this._works.push(b);
        if (b.zone === 'com') this._shops.push(b);
        if (b.zone === 'ind') this._inds.push(b);
      }
    }
  }

  private _spawnTrips(dt: number): void {
    const c = this._game.config.traffic;
    const pop = this._game.get('stats').population;
    if (pop < c.minPopulation || !this._homes.length || !this._works.length) return;
    const tod = this._game.get('time').tod;
    const bump = Math.max(Math.exp(-(((tod - c.rushMorning) / c.rushWidth) ** 2)), Math.exp(-(((tod - c.rushEvening) / c.rushWidth) ** 2)));
    this._acc += pop * c.tripsPerPop * (c.rushBase + c.rushAmp * bump) * dt;
    let guard = 4;
    while (this._acc >= 1 && guard-- > 0) {
      this._acc -= 1;
      this._newTrip();
    }
    if (this._acc > 3) this._acc = 0;
  }

  private _newTrip(): void {
    const g = this._game;
    const c = g.config.traffic;
    const home = this._homes[Math.floor(Math.random() * this._homes.length)];
    if (home.pop < 1 || !home.powered) return;
    const pool = Math.random() < c.shopShare && this._shops.length ? this._shops : this._works;
    const dest = pool[Math.floor(Math.random() * pool.length)];
    if (!dest || dest.comp !== home.comp || dest.comp < 0) return;
    // часть жителей пользуется автобусами: они появятся пассажирами на остановках, а не машинами
    if (Math.random() < g.get('transit').share(home.x, home.z)) return;
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    this._trip(home, dest, 'car', color, (v) => {
      v.onArrive = () => {
        this._pending.push({ at: this._clock + rnd(c.dwell[0], c.dwell[1]), from: dest, to: home, color });
        return false;
      };
    });
  }

  /** Асинхронно прокладывает путь и создаёт машину. */
  private _trip(from: Building, to: Building, kind: VehicleKind, color: number, init?: (v: Vehicle) => void): void {
    if (this._requests >= this._game.config.traffic.maxPendingPaths) return;
    this._requests++;
    void this._game
      .get('network')
      .requestPath(from.access, from.accessS, to.access, to.accessS)
      .then((steps) => {
        const v = this.spawn(steps, from.accessS, to.accessS, kind, color);
        if (v) init?.(v);
      })
      .finally(() => {
        this._requests--;
      });
  }

  private _flushPending(): void {
    if (!this._pending.length) return;
    const keep: PendingTrip[] = [];
    const w = this._game.world;
    for (const p of this._pending) {
      if (p.at > this._clock) keep.push(p);
      else if (w.buildings.has(p.from.id) && w.buildings.has(p.to.id) && p.from.access && p.to.access) this._trip(p.from, p.to, 'car', p.color);
    }
    this._pending = keep;
  }

  private _spawnTrucks(dt: number): void {
    const c = this._game.config.traffic;
    if (!this._inds.length || !this._shops.length) return;
    this._truckAcc += dt * Math.min(c.truckRate, this._inds.length * c.truckPerIndustry);
    if (this._truckAcc < 1) return;
    this._truckAcc = 0;
    const from = this._inds[Math.floor(Math.random() * this._inds.length)];
    let best: Building | null = null;
    for (let k = 0; k < 5; k++) {
      const s = this._shops[Math.floor(Math.random() * this._shops.length)];
      if (s.comp === from.comp && (!best || s.goods < best.goods)) best = s;
    }
    if (!best || from.comp < 0) return;
    const target = best;
    this._trip(from, target, 'truck', 0xf2f2f2, (v) => {
      v.onArrive = () => {
        target.goods = Math.min(1, target.goods + c.goodsPerTruck);
        return false;
      };
    });
  }

  // ---------- движение ----------

  /** Группа фазы светофора подхода (ребро → группа) для узла; кэш сбрасывается при изменении графа. */
  groupOf(nodeId: number, edgeId: number): 0 | 1 {
    const graph = this._game.world.graph;
    if (this._groupsVersion !== graph.version) {
      this._groups.clear();
      this._groupsVersion = graph.version;
    }
    let g = this._groups.get(nodeId);
    if (!g) {
      const node = graph.nodes.get(nodeId);
      g = node ? lightGroups(graph, node) : new Map();
      this._groups.set(nodeId, g);
    }
    return g.get(edgeId) ?? 0;
  }

  /** Сигнал светофора узла для подхода по ребру. */
  signal(nodeId: number, edgeId: number): 'green' | 'yellow' | 'red' {
    return lightState(this.groupOf(nodeId, edgeId), this._clock, this._game.config.roads);
  }

  /** Минимальная дистанция между центрами двух машин в одной полосе. */
  private _gap(a: VehicleKind, b: VehicleKind): number {
    const c = this._game.config.traffic;
    return (c.length[a] + c.length[b]) / 2 + c.gap;
  }

  private _limitStop(v: Vehicle, dir: number, s: number): void {
    v.stopS = v.stopS === undefined ? s : dir > 0 ? Math.min(v.stopS, s) : Math.max(v.stopS, s);
  }

  /** Радиус зоны перекрёстка у узла: по самой широкой дороге. */
  private _junctionR(nodeId: number): number {
    const graph = this._game.world.graph;
    const node = graph.nodes.get(nodeId);
    let hw = 4;
    if (node) for (const id of node.edges) hw = Math.max(hw, graph.edges.get(id)?.hw ?? 0);
    return hw + this._game.config.roads.junctionMargin;
  }

  /**
   * Перед шагом задаёт каждой машине предел продвижения (stopS):
   *  1) красный светофор — очередь у стоп-линии;
   *  2) дистанция до машины впереди в той же полосе и (для первой машины) до последней машины на следующем ребре;
   *  3) перекрёсток: одновременно проезжает только одна «группа подхода» (на светофоре — одна фаза).
   */
  private _prepare(dt: number): void {
    const game = this._game;
    const graph = game.world.graph;
    const rc = game.config.roads;
    this._load.clear();
    const queues = new Map<string, { v: Vehicle; d: number; limit: number; dir: number }[]>();
    const lanes = new Map<string, Vehicle[]>();
    const redHeld = new Set<Vehicle>();
    for (const v of this.vehicles) {
      v.stopS = undefined;
      if (v.dead) continue;
      const step = v.steps[v.i];
      const e = graph.edges.get(step.edge);
      if (!e) continue;
      v.p = step.dir > 0 ? v.s : e.len - v.s;
      const key = `${e.id}:${step.dir}`;
      const lane = lanes.get(key);
      if (lane) lane.push(v);
      else lanes.set(key, [v]);
      if (v.wait > 0) continue;
      const nodeId = step.dir > 0 ? e.b : e.a;
      const node = graph.nodes.get(nodeId);
      if (!node || node.edges.length < 3) continue;
      const d = step.dir > 0 ? e.len - v.s : v.s;
      const last = v.i === v.steps.length - 1;
      if (d < rc.junctionRadius) this._load.set(nodeId, (this._load.get(nodeId) ?? 0) + 1);
      if (node.light && !last && d < 70 && d > -1) {
        const sig = this.signal(nodeId, e.id);
        const stopR = this._junctionR(nodeId) + rc.lightStop;
        if (sig === 'green' || (sig === 'yellow' && d < stopR + 3)) continue;
        let arr = queues.get(key);
        if (!arr) queues.set(key, (arr = []));
        arr.push({ v, d, limit: step.dir > 0 ? e.len - stopR : stopR, dir: step.dir });
      }
    }
    for (const arr of queues.values()) {
      arr.sort((a, b) => a.d - b.d);
      arr.forEach((q, i) => {
        // уже миновавшие стоп-линию не тормозят
        if (q.dir > 0 ? q.v.s > q.limit + 0.5 : q.v.s < q.limit - 0.5) return;
        this._limitStop(q.v, q.dir, q.limit - q.dir * i * rc.queueGap);
        redHeld.add(q.v);
      });
    }

    // дистанция до машины впереди
    for (const [key, arr] of lanes) {
      arr.sort((a, b) => b.p - a.p);
      const first = arr[0];
      const step0 = first.steps[first.i];
      const e = graph.edges.get(step0.edge)!;
      void key;
      for (let k = 1; k < arr.length; k++) {
        const v = arr[k];
        const lead = arr[k - 1];
        const maxP = lead.p - this._gap(lead.kind, v.kind);
        this._limitStop(v, step0.dir, step0.dir > 0 ? maxP : e.len - maxP);
      }
      // первая машина: смотрим на хвост очереди на следующем ребре
      if (first.i < first.steps.length - 1) {
        const nx = first.steps[first.i + 1];
        const tail = lanes.get(`${nx.edge}:${nx.dir}`);
        if (tail && tail.length) {
          let rear = tail[0];
          for (const t of tail) if (t.p < rear.p) rear = t;
          const rem = e.len - first.p;
          const room = rem + rear.p - this._gap(rear.kind, first.kind);
          if (room < rem) this._limitStop(first, step0.dir, first.s + step0.dir * Math.max(0, room));
        }
      }
    }

    // перекрёстки: занятость
    const occ = new Map<number, Vehicle[]>();
    const starving = new Map<number, string>();
    for (const v of this.vehicles) {
      if (v.dead || v.jn === undefined) continue;
      const step = v.steps[v.i];
      const e = graph.edges.get(step.edge);
      let valid = false;
      if (e && v.jg !== undefined) {
        const R = this._junctionR(v.jn);
        const endNode = step.dir > 0 ? e.b : e.a;
        const startNode = step.dir > 0 ? e.a : e.b;
        if (endNode === v.jn) valid = (step.dir > 0 ? e.len - v.s : v.s) < R + rc.junctionReserve;
        else if (startNode === v.jn) valid = (step.dir > 0 ? v.s : e.len - v.s) < R + 2;
      }
      if (!valid) {
        v.jn = undefined;
        v.jg = undefined;
        continue;
      }
      const list = occ.get(v.jn);
      if (list) list.push(v);
      else occ.set(v.jn, [v]);
    }
    for (const v of this.vehicles) {
      if (v.dead || v.wait > 0 || v.i >= v.steps.length - 1 || v.jn !== undefined) {
        if (v.jn === undefined) v.jwait = 0;
        continue;
      }
      const step = v.steps[v.i];
      const e = graph.edges.get(step.edge);
      if (!e) continue;
      const nodeId = step.dir > 0 ? e.b : e.a;
      const node = graph.nodes.get(nodeId);
      if (!node || node.edges.length < 3) continue;
      const R = this._junctionR(nodeId);
      const d = step.dir > 0 ? e.len - v.s : v.s;
      if (d > R + rc.junctionReserve) continue;
      if (redHeld.has(v)) continue;
      const group = node.light ? `L${this.groupOf(nodeId, e.id)}` : `${e.id}:${step.dir}`;
      const approach = `${e.id}:${step.dir}`;
      // левый поворот: пересекает встречный поток, поэтому не едет одновременно с чужими подходами
      const nx = v.steps[v.i + 1];
      const ne = graph.edges.get(nx.edge);
      let left = false;
      if (ne) {
        const t0 = graph.pointAt(e, step.dir > 0 ? e.len : 0);
        const t1 = graph.pointAt(ne, nx.dir > 0 ? 0 : ne.len);
        left = (t0.tx * step.dir) * (t1.tz * nx.dir) - (t0.tz * step.dir) * (t1.tx * nx.dir) < -0.5;
      }
      const here = occ.get(nodeId);
      let ok = !here || here.every((o) => o.jg === group && (o.ja === approach || (!o.jl && !left)));
      const starve = starving.get(nodeId);
      if (ok && starve && starve !== group && v.jwait < rc.junctionStarve) ok = false;
      if (!ok && v.jwait > rc.junctionPatience) ok = true;
      if (ok) {
        v.jn = nodeId;
        v.jg = group;
        v.ja = approach;
        v.jl = left;
        v.jwait = 0;
        const list = occ.get(nodeId);
        if (list) list.push(v);
        else occ.set(nodeId, [v]);
      } else {
        v.jwait += dt;
        if (v.jwait > rc.junctionStarve && !starving.has(nodeId)) starving.set(nodeId, group);
        this._limitStop(v, step.dir, step.dir > 0 ? e.len - R : R);
      }
    }
  }

  private _move(dt: number): void {
    const game = this._game;
    const graph = game.world.graph;
    this._prepare(dt);
    let flowSum = 0;
    let flowN = 0;
    const net = game.get('network');
    const rc = game.config.roads;
    for (const v of this.vehicles) {
      if (v.dead) continue;
      v.age += dt;
      if (v.age > game.config.traffic.maxAge && (v.kind === 'car' || v.kind === 'truck')) {
        this.kill(v);
        continue;
      }
      if (v.wait > 0) {
        v.wait -= dt;
        this._place(v, false);
        continue;
      }
      const step = v.steps[v.i];
      const e = graph.edges.get(step.edge);
      if (!e || e.rev !== v.revs[v.i]) {
        this.kill(v);
        continue;
      }
      const type = game.roadTypes.at(e.type);
      const k = (this.occupancy.get(e.id) ?? 0) / net.capacityOf(e);
      let f = Math.max(game.config.traffic.minFlow, 1 / (1 + k * k * game.config.traffic.congestionPower));
      const nodeId = step.dir > 0 ? e.b : e.a;
      const node = graph.nodes.get(nodeId);
      if (node && node.edges.length >= 3 && !node.light && (this._load.get(nodeId) ?? 0) > rc.junctionBusy) {
        const d = step.dir > 0 ? e.len - v.s : v.s;
        if (d < rc.junctionRadius) f *= rc.junctionPenalty;
      }
      flowSum += f;
      flowN++;
      const urgent = v.kind === 'police' ? 1.3 : 1;
      let ns = v.s + step.dir * type.speed * f * v.slow * v.speedMul * urgent * dt;
      if (v.stopS !== undefined) ns = step.dir > 0 ? Math.min(ns, Math.max(v.s, v.stopS)) : Math.max(ns, Math.min(v.s, v.stopS));
      v.s = ns;

      const last = v.i === v.steps.length - 1;
      const limit = last ? v.endS : step.dir > 0 ? e.len : 0;
      const done = step.dir > 0 ? v.s >= limit : v.s <= limit;
      if (done) {
        if (last) {
          const again = v.onArrive?.(v) ?? false;
          if (!again) this.kill(v);
          continue;
        }
        this._occ(step.edge, -1);
        v.i++;
        const next = v.steps[v.i];
        const ne = graph.edges.get(next.edge);
        if (!ne) {
          this.kill(v);
          continue;
        }
        v.s = next.dir > 0 ? 0 : ne.len;
        this._occ(next.edge, 1);
      }
      this._place(v, false);
    }
    this.vehicles = this.vehicles.filter((v) => !v.dead);
    const target = flowN ? flowSum / flowN : 1;
    this.flow += (target - this.flow) * Math.min(1, dt * game.config.traffic.flowSmoothing);
  }

  /** Точка и курс на полосе ребра в положении s при движении в направлении dir. */
  private _lane(e: RoadEdge, dir: number, s: number): { x: number; z: number; tx: number; tz: number } {
    const graph = this._game.world.graph;
    const p = graph.pointAt(e, Math.min(e.len, Math.max(0, s)));
    const tx = p.tx * dir;
    const tz = p.tz * dir;
    const lane = this._game.roadTypes.at(e.type).laneOffset;
    // правый борт по ходу движения
    return { x: p.x - tz * lane, z: p.z + tx * lane, tx, tz };
  }

  /** Вычисляет мировую позицию и курс; у перекрёстка машина идёт по плавной дуге (кривая Безье между полосами). */
  private _place(v: Vehicle, snap: boolean): void {
    const graph = this._game.world.graph;
    const step = v.steps[v.i];
    const e = graph.edges.get(step.edge);
    if (!e) return;
    const R = this._game.config.roads.turnRadius;
    let pos = this._lane(e, step.dir, v.s);
    let slow = 1;
    // дуга на подходе к перекрёстку или на выезде из него
    let arc: { a: ReturnType<TrafficSystem['_lane']>; b: ReturnType<TrafficSystem['_lane']>; u: number } | null = null;
    const rem = step.dir > 0 ? e.len - v.s : v.s;
    const nx = v.i < v.steps.length - 1 ? v.steps[v.i + 1] : null;
    const ne = nx ? graph.edges.get(nx.edge) : undefined;
    if (nx && ne) {
      const T = Math.min(R, e.len / 2, ne.len / 2);
      if (rem < T) {
        arc = { a: this._lane(e, step.dir, step.dir > 0 ? e.len - T : T), b: this._lane(ne, nx.dir, nx.dir > 0 ? T : ne.len - T), u: 0.5 * (1 - rem / T) };
      }
    }
    if (!arc && v.i > 0) {
      const pv = v.steps[v.i - 1];
      const pe = graph.edges.get(pv.edge);
      if (pe) {
        const T = Math.min(R, e.len / 2, pe.len / 2);
        const out = step.dir > 0 ? v.s : e.len - v.s;
        if (out < T) arc = { a: this._lane(pe, pv.dir, pv.dir > 0 ? pe.len - T : T), b: this._lane(e, step.dir, step.dir > 0 ? T : e.len - T), u: 0.5 + 0.5 * (out / T) };
      }
    }
    let yawT = Math.atan2(-pos.tz, pos.tx);
    if (arc) {
      const { a, b, u } = arc;
      // контрольная точка — пересечение касательных
      const cr = a.tx * b.tz - a.tz * b.tx;
      let cx = (a.x + b.x) / 2;
      let cz = (a.z + b.z) / 2;
      if (Math.abs(cr) > 1e-3) {
        const t = ((b.x - a.x) * b.tz - (b.z - a.z) * b.tx) / cr;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (t > 0 && t < len * 1.5) {
          cx = a.x + a.tx * t;
          cz = a.z + a.tz * t;
        }
      }
      const w0 = (1 - u) * (1 - u);
      const w1 = 2 * u * (1 - u);
      const w2 = u * u;
      pos = { x: w0 * a.x + w1 * cx + w2 * b.x, z: w0 * a.z + w1 * cz + w2 * b.z, tx: pos.tx, tz: pos.tz };
      const dx = 2 * (1 - u) * (cx - a.x) + 2 * u * (b.x - cx);
      const dz = 2 * (1 - u) * (cz - a.z) + 2 * u * (b.z - cz);
      if (Math.hypot(dx, dz) > 1e-4) yawT = Math.atan2(-dz, dx);
      slow = 1 - 0.4 * Math.min(1, (1 - (a.tx * b.tx + a.tz * b.tz)) / 1.2);
    }
    v.slow = slow;
    v.x = pos.x;
    v.z = pos.z;
    let d = yawT - v.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    v.yaw = snap ? yawT : v.yaw + d * 0.35;
  }

  /** После изменения дорог убираем машины на исчезнувших/изменённых рёбрах и пересчитываем занятость. */
  private _validate(): void {
    const graph = this._game.world.graph;
    this.occupancy.clear();
    for (const v of this.vehicles) {
      if (v.dead) continue;
      let ok = true;
      for (let k = v.i; k < v.steps.length; k++) {
        const e = graph.edges.get(v.steps[k].edge);
        if (!e || e.rev !== v.revs[k]) {
          ok = false;
          break;
        }
      }
      if (!ok) v.dead = true;
      else this._occ(v.steps[v.i].edge, 1);
    }
    this.vehicles = this.vehicles.filter((v) => !v.dead);
  }
}
