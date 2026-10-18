import { isIdle } from '../core/types';
import type { Game } from '../core/Game';
import type { System } from '../core/System';

declare module '../core/Game' {
  interface SystemMap {
    utility: UtilitySystem;
  }
}

/**
 * Электричество и вода. Сеть = связная компонента дорог: производитель снабжает здания,
 * подключённые к той же компоненте. При дефиците ресурс достаётся более старым зданиям (по id).
 */
export class UtilitySystem implements System {
  readonly id = 'utility';
  readonly order = 20;
  version = 0;
  powerSupply = 0;
  powerDemand = 0;
  waterSupply = 0;
  waterDemand = 0;
  private _powerLeft = new Float64Array(0);
  private _waterLeft = new Float64Array(0);
  private _game!: Game;
  private _dirty = true;
  private _timer = 0;
  private _netVersion = -1;

  init(game: Game): void {
    this._game = game;
    const mark = (): void => {
      this._dirty = true;
    };
    game.bus.on('building:added', mark);
    game.bus.on('building:removed', mark);
    game.bus.on('building:updated', mark);
    game.bus.on('mods:changed', mark);
  }

  update(_dt: number, realDt: number): void {
    const net = this._game.get('network');
    const c = this._game.config.utilities;
    this._timer += realDt;
    if (net.version !== this._netVersion) {
      this._netVersion = net.version;
      this._dirty = true;
    }
    if ((this._dirty && this._timer > c.interval) || this._timer > c.maxInterval) {
      this._timer = 0;
      this._dirty = false;
      this.recompute();
    }
  }

  /** Хватит ли запаса в сети компоненты на ещё одно здание. */
  hasSpare(comp: number, power: number, water: number): boolean {
    if (comp < 0 || comp >= this._powerLeft.length) return false;
    return this._powerLeft[comp] >= power && this._waterLeft[comp] >= water;
  }

  /** Резервирует ресурсы под только что построенное здание (до следующего пересчёта). */
  reserve(comp: number, power: number, water: number): void {
    if (comp < 0 || comp >= this._powerLeft.length) return;
    this._powerLeft[comp] -= power;
    this._waterLeft[comp] -= water;
  }

  recompute(): void {
    const g = this._game;
    const count = g.get('network').compCount;
    const pLeft = new Float64Array(count);
    const wLeft = new Float64Array(count);
    this.powerSupply = this.powerDemand = this.waterSupply = this.waterDemand = 0;
    const list = g.world.list();
    const pm = g.get('mods').mul('powerDemand');
    const wm = g.get('mods').mul('waterDemand');

    for (const b of list) {
      if (b.powerOut > 0 && !isIdle(b)) {
        this.powerSupply += b.powerOut;
        if (b.comp >= 0) pLeft[b.comp] += b.powerOut;
      }
    }
    for (const b of list) {
      const need = isIdle(b) ? 0 : b.powerNeed * pm;
      this.powerDemand += need;
      if (need <= 0) b.powered = true;
      else if (b.comp >= 0 && pLeft[b.comp] >= need) {
        pLeft[b.comp] -= need;
        b.powered = true;
      } else b.powered = false;
    }
    for (const b of list) {
      if (b.waterOut > 0 && b.powered && !isIdle(b)) {
        this.waterSupply += b.waterOut;
        if (b.comp >= 0) wLeft[b.comp] += b.waterOut;
      }
    }
    for (const b of list) {
      const need = isIdle(b) ? 0 : b.waterNeed * wm;
      this.waterDemand += need;
      if (need <= 0) b.watered = true;
      else if (b.comp >= 0 && wLeft[b.comp] >= need) {
        wLeft[b.comp] -= need;
        b.watered = true;
      } else b.watered = false;
    }
    this._powerLeft = pLeft;
    this._waterLeft = wLeft;
    this.version++;
  }
}
