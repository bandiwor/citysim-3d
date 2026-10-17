import type { Game } from '../core/Game';
import type { System } from '../core/System';
import type { Building } from '../core/types';
import type { PathStep } from './NetworkSystem';
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
    if (this.vehicles.length >= c.maxVehicles + (kind === 'car' || kind === 'truck' ? 0 : c.busExtra)) return null;
    const graph = this._game.world.graph;
    if (steps.some((s) => !graph.edges.has(s.edge))) return null;
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
      if (b.abandoned || !b.access) continue;
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

  /** Перед шагом: красные светофоры формируют очереди; загруженные перекрёстки без светофора замедляют проезд. */
  private _prepare(): void {
    const game = this._game;
    const graph = game.world.graph;
    const rc = game.config.roads;
    this._load.clear();
    const queues = new Map<string, { v: Vehicle; d: number; limit: number; dir: number }[]>();
    for (const v of this.vehicles) {
      v.stopS = undefined;
      if (v.dead || v.wait > 0) continue;
      const step = v.steps[v.i];
      const e = graph.edges.get(step.edge);
      if (!e) continue;
      const nodeId = step.dir > 0 ? e.b : e.a;
      const node = graph.nodes.get(nodeId);
      if (!node || node.edges.length < 3) continue;
      const d = step.dir > 0 ? e.len - v.s : v.s;
      const last = v.i === v.steps.length - 1;
      if (d < rc.junctionRadius) this._load.set(nodeId, (this._load.get(nodeId) ?? 0) + 1);
      if (node.light && !last && d < 70 && d > -1) {
        const sig = this.signal(nodeId, e.id);
        if (sig === 'green' || (sig === 'yellow' && d < rc.lightStop + 3)) continue;
        const key = `${e.id}:${step.dir}`;
        let arr = queues.get(key);
        if (!arr) queues.set(key, (arr = []));
        arr.push({ v, d, limit: step.dir > 0 ? e.len - rc.lightStop : rc.lightStop, dir: step.dir });
      }
    }
    for (const arr of queues.values()) {
      arr.sort((a, b) => a.d - b.d);
      arr.forEach((q, i) => {
        // уже миновавшие стоп-линию не тормозят
        if (q.dir > 0 ? q.v.s > q.limit + 0.5 : q.v.s < q.limit - 0.5) return;
        q.v.stopS = q.limit - q.dir * i * rc.queueGap;
      });
    }
  }

  private _move(dt: number): void {
    const game = this._game;
    const graph = game.world.graph;
    this._prepare();
    const decay = Math.exp(-dt * game.config.traffic.offsetDecay);
    let flowSum = 0;
    let flowN = 0;
    const net = game.get('network');
    const rc = game.config.roads;
    for (const v of this.vehicles) {
      if (v.dead) continue;
      v.ox *= decay;
      v.oz *= decay;
      v.age += dt;
      if (v.age > game.config.traffic.maxAge && v.kind !== 'bus') {
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
      let ns = v.s + step.dir * type.speed * f * v.speedMul * urgent * dt;
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
        const px = v.x;
        const pz = v.z;
        v.s = next.dir > 0 ? 0 : ne.len;
        this._occ(next.edge, 1);
        this._place(v, false);
        const jx = px - v.x;
        const jz = pz - v.z;
        if (Math.hypot(jx, jz) < 10) {
          v.ox += jx - v.ox;
          v.oz += jz - v.oz;
          v.x = px;
          v.z = pz;
        }
        continue;
      }
      this._place(v, false);
    }
    this.vehicles = this.vehicles.filter((v) => !v.dead);
    const target = flowN ? flowSum / flowN : 1;
    this.flow += (target - this.flow) * Math.min(1, dt * game.config.traffic.flowSmoothing);
  }

  /** Вычисляет мировую позицию и курс по положению на ребре. */
  private _place(v: Vehicle, snap: boolean): void {
    const graph = this._game.world.graph;
    const step = v.steps[v.i];
    const e = graph.edges.get(step.edge);
    if (!e) return;
    const p = graph.pointAt(e, v.s);
    const tx = p.tx * step.dir;
    const tz = p.tz * step.dir;
    const lane = this._game.roadTypes.at(e.type).laneOffset;
    // правый борт по ходу движения
    const tx0 = p.x - tz * lane;
    const tz0 = p.z + tx * lane;
    v.x = tx0 + v.ox;
    v.z = tz0 + v.oz;
    const target = Math.atan2(-tz, tx);
    let d = target - v.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    v.yaw = snap ? target : v.yaw + d * 0.3;
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
