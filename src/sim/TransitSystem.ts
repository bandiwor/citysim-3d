import type { Game } from '../core/Game';
import type { System } from '../core/System';
import type { Vehicle } from './TrafficSystem';

declare module '../core/Game' {
  interface SystemMap {
    transit: TransitSystem;
  }
}

const STOP_RADIUS = 6;
const FARE = 1.6;

/**
 * Общественный транспорт: остановки на дорогах, автобусы курсируют по замкнутому маршруту между остановками
 * одной связной сети. Покрытие остановками уменьшает число поездок на личных авто и приносит доход от билетов.
 */
export class TransitSystem implements System {
  readonly id = 'transit';
  readonly order = 55;
  stops: number[] = [];
  buses: Vehicle[] = [];
  riders = 0;
  ridersMonth = 0;
  private _cov = new Float32Array(0);
  private _stopPop = new Map<number, number>();
  private _game!: Game;
  private _dirty = true;
  private _timer = 0;

  init(game: Game): void {
    this._game = game;
    this._cov = new Float32Array(game.world.cells);
    game.bus.on('stops:changed', () => (this._dirty = true));
    game.bus.on('roads:changed', () => (this._dirty = true));
    game.bus.on('time:month', () => (this.ridersMonth = 0));
  }

  /** Доля поездок из клетки, уходящая на общественный транспорт. */
  share(cell: number): number {
    if (!this.buses.length) return 0;
    const bus = Math.min(1, this.buses.length / Math.max(1, this.stops.length / 2));
    return Math.min(0.5, this._cov[cell] * 0.55 * bus);
  }

  rider(n = 1): void {
    this.riders += n;
    this.ridersMonth += n;
    this._game.get('economy').earnTransit(n * FARE);
  }

  upkeep(): number {
    return this.stops.length * 8 + this.buses.length * 30;
  }

  update(_dt: number, realDt: number): void {
    this._timer += realDt;
    if (this._dirty && this._timer > 0.3) {
      this._timer = 0;
      this._dirty = false;
      this._rebuild();
    }
  }

  private _rebuild(): void {
    const g = this._game;
    const w = g.world;
    const traffic = g.get('traffic');
    for (const b of this.buses) traffic.kill(b);
    this.buses = [];

    // порядок остановок — по времени постановки
    this.stops = this.stops.filter((c) => w.stop[c]);
    for (let c = 0; c < w.cells; c++) if (w.stop[c] && !this.stops.includes(c)) this.stops.push(c);

    // покрытие и население рядом
    this._cov.fill(0);
    this._stopPop.clear();
    const n = w.size;
    for (const s of this.stops) {
      const sx = s % n;
      const sy = (s / n) | 0;
      let pop = 0;
      for (let y = Math.max(0, sy - STOP_RADIUS); y <= Math.min(n - 1, sy + STOP_RADIUS); y++) {
        for (let x = Math.max(0, sx - STOP_RADIUS); x <= Math.min(n - 1, sx + STOP_RADIUS); x++) {
          const d = Math.hypot(x - sx, y - sy) / STOP_RADIUS;
          if (d >= 1) continue;
          const i = y * n + x;
          this._cov[i] = Math.min(1, this._cov[i] + (1 - d));
          const b = w.buildingAt(x, y);
          if (b && b.zone === 'res') pop += b.pop / (b.w * b.h);
        }
      }
      this._stopPop.set(s, pop);
    }

    // маршруты по связным сетям
    const net = g.get('network');
    const groups = new Map<number, number[]>();
    for (const s of this.stops) {
      const comp = net.comp[s];
      if (comp < 0) continue;
      if (!groups.has(comp)) groups.set(comp, []);
      groups.get(comp)!.push(s);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const count = Math.min(6, Math.ceil(list.length / 2));
      for (let k = 0; k < count; k++) {
        const start = Math.floor((k * list.length) / count);
        const bus = traffic.spawn(net.findPath(list[start], list[(start + 1) % list.length]), 'bus', 0xe8a21a);
        if (!bus) continue;
        let idx = (start + 1) % list.length;
        bus.onArrive = (v) => {
          const stop = list[idx];
          const riders = Math.round(Math.min(30, (this._stopPop.get(stop) ?? 0) * 0.04));
          if (riders > 0) this.rider(riders);
          idx = (idx + 1) % list.length;
          const ok = traffic.reroute(v, net.findPath(stop, list[idx]));
          v.wait = 2.2;
          return ok;
        };
        this.buses.push(bus);
      }
    }
  }
}
