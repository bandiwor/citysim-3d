import { isIdle } from '../core/types';
import { effectiveDef } from '../data/services';
import type { Game } from '../core/Game';
import type { System } from '../core/System';
import type { Building } from '../core/types';
import type { Vehicle, VehicleKind } from './TrafficSystem';

declare module '../core/Game' {
  interface SystemMap {
    fleet: FleetSystem;
  }
}

export interface MissionHooks {
  /** машина приехала к цели */
  onArrive?(v: Vehicle): void;
  /** такси высадило пассажира в конечной точке `via` */
  onVia?(v: Vehicle): void;
  /** машина вернулась в здание-базу */
  onReturn?(v: Vehicle): void;
  /** миссия сорвалась (нет пути, машину убрали) */
  onFail?(): void;
}

interface Mission {
  facility: number;
  hooks: MissionHooks;
  vehicle: Vehicle | null;
  done: boolean;
}

/**
 * Парки служебных машин (полиция, мусоровозы, катафалки): здание-база отправляет машину к цели и принимает обратно.
 * Число одновременно работающих машин ограничено `ServiceDef.fleet.count`.
 */
export class FleetSystem implements System {
  readonly id = 'fleet';
  readonly order = 52;
  private _game!: Game;
  private _out = new Map<number, number>();
  private _missions: Mission[] = [];

  init(game: Game): void {
    this._game = game;
  }

  /** Здания-базы данного типа машин. */
  facilities(kind: VehicleKind): Building[] {
    const g = this._game;
    return g.world.list().filter((b) => {
      if (b.kind !== 'service' || isIdle(b)) return false;
      const d = g.services.require(b.defId);
      return d.fleet?.kind === kind && (b.powered || d.powerNeed === 0) && b.access > 0;
    });
  }

  free(facility: Building): number {
    const cap = effectiveDef(this._game.services.require(facility.defId), facility.up).fleet?.count ?? 0;
    return cap - (this._out.get(facility.id) ?? 0);
  }

  active(facility: Building): number {
    return this._out.get(facility.id) ?? 0;
  }

  /** Ближайшая база с свободной машиной в той же сети дорог. */
  nearest(kind: VehicleKind, target: Building, filter?: (f: Building) => boolean): Building | null {
    let best: Building | null = null;
    let bd = Infinity;
    for (const f of this.facilities(kind)) {
      if (f.comp !== target.comp || f.comp < 0 || this.free(f) <= 0 || (filter && !filter(f))) continue;
      const d = Math.hypot(f.x - target.x, f.z - target.z);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  /** Отправляет машину из facility к target и обратно. false — сразу невозможно. */
  launch(facility: Building, target: Building, color: number, hooks: MissionHooks = {}, via?: Building): boolean {
    const g = this._game;
    const def = effectiveDef(g.services.require(facility.defId), facility.up);
    if (!def.fleet || this.free(facility) <= 0 || !facility.access || !target.access || facility.comp !== target.comp) return false;
    if (via && (!via.access || via.comp !== facility.comp)) return false;
    const mission: Mission = { facility: facility.id, hooks, vehicle: null, done: false };
    this._out.set(facility.id, (this._out.get(facility.id) ?? 0) + 1);
    this._missions.push(mission);
    const traffic = g.get('traffic');
    const net = g.get('network');
    void net.requestPath(facility.access, facility.accessS, target.access, target.accessS).then((steps) => {
      const v = traffic.spawn(steps, facility.accessS, target.accessS, def.fleet!.kind, color);
      if (!v) return this._finish(mission, true);
      mission.vehicle = v;
      // этапы пути: база → цель [→ via] → база
      const legs: Building[] = via ? [target, via, facility] : [target, facility];
      let leg = 0;
      const next = (at: Building): void => {
        const to = legs[leg + 1];
        void net.requestPath(at.access, at.accessS, to.access, to.accessS).then((p) => {
          if (v.dead) return;
          if (!traffic.reroute(v, p, at.accessS, to.accessS)) {
            traffic.kill(v);
            return;
          }
          v.wait = 0.8;
          leg++;
          v.onArrive = arrive;
        });
      };
      const arrive = (): boolean => {
        const at = legs[leg];
        if (leg === legs.length - 1) {
          hooks.onReturn?.(v);
          this._finish(mission, false);
          return false;
        }
        if (leg === 0) hooks.onArrive?.(v);
        else hooks.onVia?.(v);
        v.wait = Infinity;
        next(at);
        return true;
      };
      v.onArrive = arrive;
    });
    return true;
  }

  private _finish(m: Mission, failed: boolean): void {
    if (m.done) return;
    m.done = true;
    this._out.set(m.facility, Math.max(0, (this._out.get(m.facility) ?? 1) - 1));
    if (failed) m.hooks.onFail?.();
  }

  update(): void {
    if (!this._missions.length) return;
    for (const m of this._missions) if (!m.done && m.vehicle?.dead) this._finish(m, true);
    this._missions = this._missions.filter((m) => !m.done);
  }
}
