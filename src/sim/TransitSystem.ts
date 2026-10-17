import type { Game } from '../core/Game';
import type { System } from '../core/System';
import type { BusStop } from '../core/types';
import type { Vehicle } from './TrafficSystem';

declare module '../core/Game' {
  interface SystemMap {
    transit: TransitSystem;
  }
}

/**
 * Общественный транспорт: остановки на дорогах, автобусы курсируют по замкнутому маршруту между остановками
 * одной связной сети. Покрытие остановками уменьшает число поездок на личных авто и приносит доход от билетов.
 */
export class TransitSystem implements System {
  readonly id = 'transit';
  readonly order = 55;
  buses: Vehicle[] = [];
  riders = 0;
  ridersMonth = 0;
  private _game!: Game;
  private _stopPop = new Map<number, number>();
  private _dirty = true;
  private _timer = 0;
  private _gen = 0;
  private _netVersion = -1;

  init(game: Game): void {
    this._game = game;
    game.bus.on('stops:changed', () => (this._dirty = true));
    game.bus.on('time:month', () => (this.ridersMonth = 0));
  }

  get stops(): readonly BusStop[] {
    return this._game.world.stops;
  }

  /** Доля поездок из точки, уходящая на общественный транспорт. */
  share(x: number, z: number): number {
    const c = this._game.config.transit;
    const stops = this.stops;
    if (!this.buses.length) return 0;
    let cov = 0;
    const r = c.stopRadius * 8;
    for (const s of stops) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < r) cov += 1 - d / r;
    }
    const bus = Math.min(1, this.buses.length / Math.max(1, stops.length / 2));
    return Math.min(c.shareMax, Math.min(1, cov) * c.shareFactor * bus);
  }

  rider(n = 1): void {
    this.riders += n;
    this.ridersMonth += n;
    this._game.get('economy').earnTransit(n * this._game.config.economy.fare);
  }

  upkeep(): number {
    const c = this._game.config.economy;
    return this.stops.length * c.stopUpkeep + this.buses.length * c.busUpkeep;
  }

  update(_dt: number, realDt: number): void {
    const net = this._game.get('network');
    if (net.version !== this._netVersion) {
      this._netVersion = net.version;
      this._dirty = true;
    }
    this._timer += realDt;
    if (this._dirty && this._timer > 0.3) {
      this._timer = 0;
      this._dirty = false;
      this.rebuild();
    }
  }

  /** Пересоздаёт автобусы: маршрут на каждую связную сеть с ≥ 2 остановками. */
  rebuild(): void {
    const g = this._game;
    const c = g.config.transit;
    const traffic = g.get('traffic');
    const net = g.get('network');
    const gen = ++this._gen;
    for (const b of this.buses) traffic.kill(b);
    this.buses = [];

    this._stopPop.clear();
    const radius = c.stopRadius * 8;
    for (const s of this.stops) {
      let pop = 0;
      for (const b of g.world.buildingsNear(s.x, s.z, radius)) {
        if (g.zoneTypes.get(b.zone)?.housing && Math.hypot(b.x - s.x, b.z - s.z) < radius) pop += b.pop;
      }
      this._stopPop.set(s.id, pop);
    }

    const groups = new Map<number, BusStop[]>();
    for (const s of this.stops) {
      const comp = net.compOfEdge(s.edge);
      if (comp < 0) continue;
      if (!groups.has(comp)) groups.set(comp, []);
      groups.get(comp)!.push(s);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const count = Math.min(c.maxBusesPerGroup, Math.ceil(list.length / 2));
      for (let k = 0; k < count; k++) {
        const start = Math.floor((k * list.length) / count);
        this._launch(list, start, gen);
      }
    }
  }

  private _launch(list: BusStop[], start: number, gen: number): void {
    const g = this._game;
    const net = g.get('network');
    const traffic = g.get('traffic');
    const a = list[start];
    let idx = (start + 1) % list.length;
    const b = list[idx];
    void net.requestPath(a.edge, a.s, b.edge, b.s).then((steps) => {
      if (gen !== this._gen) return;
      const bus = traffic.spawn(steps, a.s, b.s, 'bus', 0xe8a21a);
      if (!bus) return;
      this.buses.push(bus);
      bus.onArrive = (v) => {
        const stop = list[idx];
        const riders = Math.round(Math.min(g.config.transit.maxRidersPerStop, (this._stopPop.get(stop.id) ?? 0) * g.config.transit.ridersPerPop));
        if (riders > 0) this.rider(riders);
        g.sfx('bus');
        idx = (idx + 1) % list.length;
        const next = list[idx];
        v.wait = Infinity;
        void net.requestPath(stop.edge, stop.s, next.edge, next.s).then((st) => {
          if (gen !== this._gen || v.dead) return;
          if (!traffic.reroute(v, st, stop.s, next.s)) traffic.kill(v);
          else v.wait = g.config.transit.busWait;
        });
        return true;
      };
    });
  }
}
