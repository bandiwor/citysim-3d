import { isIdle } from '../core/types';
import { CELL } from '../config/constants';
import { effectiveDef } from '../data/services';
import { t } from '../i18n';
import type { Game } from '../core/Game';
import type { System } from '../core/System';
import type { Building } from '../core/types';

declare module '../core/Game' {
  interface SystemMap {
    crime: CrimeSystem;
  }
}

/**
 * Ограбления: чем слабее полиция и выше безработица, тем чаще. Из ближайшего участка выезжает патруль;
 * если он успевает — преступника ловят (штраф в казну), иначе по истечении времени пропадает выручка.
 */
export class CrimeSystem implements System {
  readonly id = 'crime';
  readonly order = 48;
  robberies = 0;
  caught = 0;
  lootMonth = 0;
  private _game!: Game;
  private _acc = 0;

  init(game: Game): void {
    this._game = game;
    game.bus.on('time:month', () => (this.lootMonth = 0));
  }

  get active(): Building[] {
    return this._game.world.list().filter((b) => b.incident > 0);
  }

  update(dt: number): void {
    if (dt <= 0) return;
    const c = this._game.config.crime;
    this._acc += dt;
    if (this._acc < c.interval) return;
    const step = this._acc;
    this._acc = 0;
    this._tick(step);
  }

  /** Вероятность ограбления в секунду для здания. */
  rateOf(b: Building): number {
    const g = this._game;
    const c = g.config.crime;
    if (isIdle(b) || b.kind !== 'zone') return 0;
    const housing = g.zoneTypes.require(b.zone).housing;
    const activity = housing ? Math.min(1, b.pop / 10) : Math.min(1, b.workers / 8);
    const police = g.get('maps').sample('police', b.x, b.z);
    const unemployment = g.get('stats').unemployment;
    // сам участок отпугивает: в его радиусе вероятность падает до 25% у стен и растёт к границе
    let deter = 1;
    for (const st of this._stations) {
      const d = Math.hypot(b.x - st.x, b.z - st.z) / st.r;
      if (d < 1) deter = Math.min(deter, c.stationDeterrence + (1 - c.stationDeterrence) * d * d);
    }
    return g.get('mods').mul('crime') * c.baseRate * activity * deter * (1 + unemployment * c.unemploymentBoost) * (1 - police * c.policeEffect);
  }

  /** Начать ограбление в здании (вызывается случайно или вручную в тестах). */
  start(b: Building): boolean {
    const g = this._game;
    const c = g.config.crime;
    if (b.incident > 0 || this.active.length >= c.maxActive) return false;
    b.incident = c.timeout;
    this.robberies++;
    g.message('msg.robbery', { name: this._nameOf(b) }, 'bad');
    g.sfx('alarm');
    const fleet = g.get('fleet');
    const station = fleet.nearest('police', b);
    if (station) {
      fleet.launch(station, b, 0xffffff, {
        onArrive: () => {
          if (b.incident <= 0) return;
          b.incident = 0;
          this.caught++;
          g.get('economy').money += c.fine;
          g.message('msg.robberyCaught', { fine: c.fine }, 'good');
          g.sfx('levelup');
        },
      });
    }
    g.bus.emit('building:updated', b);
    return true;
  }

  private _nameOf(b: Building): string {
    return t(b.kind === 'zone' ? `zone.${b.zone}.name` : `service.${b.defId}.name`);
  }

  private _stations: { x: number; z: number; r: number }[] = [];

  /** Работающие отделения полиции с учётом улучшений. */
  private _refreshStations(): void {
    const g = this._game;
    this._stations = [];
    for (const b of g.world.list()) {
      if (b.kind !== 'service' || isIdle(b)) continue;
      const d = effectiveDef(g.services.require(b.defId), b.up);
      if (d.coverage?.type !== 'police' || !(b.powered || d.powerNeed === 0)) continue;
      this._stations.push({ x: b.x, z: b.z, r: d.coverage.radius * CELL });
    }
  }

  private _tick(dt: number): void {
    const g = this._game;
    const c = g.config.crime;
    this._refreshStations();
    // пока полиция не открыта (или город совсем мал), новых ограблений нет
    const quiet = !g.get('progress').isUnlocked('service:police') || g.get('stats').population < c.minPopulation;
    for (const b of g.world.list()) {
      if (b.incident > 0) {
        b.incident -= dt;
        if (b.incident <= 0) {
          b.incident = 0;
          const housing = g.zoneTypes.get(b.zone)?.housing;
          const loot = Math.round((housing ? b.pop * c.lootPerResident : b.jobs * c.lootPerJob) + 20);
          g.get('economy').money -= loot;
          this.lootMonth += loot;
          g.message('msg.robberyLoss', { amount: loot }, 'bad');
          g.bus.emit('building:updated', b);
        }
        continue;
      }
      if (quiet) continue;
      const p = this.rateOf(b) * dt;
      if (p > 0 && Math.random() < p) this.start(b);
    }
  }
}
