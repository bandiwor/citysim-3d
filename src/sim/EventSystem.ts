import type { Game } from '../core/Game';
import type { System } from '../core/System';
import { CITY_EVENTS, type CityEventDef, type CityEventOption } from '../data/events';
import { fmtMoney, t } from '../i18n';

declare module '../core/Game' {
  interface SystemMap {
    events: EventSystem;
  }
}

/** События города: раз в несколько месяцев приходит ситуация с выбором — деньги против последствий. */
export class EventSystem implements System {
  readonly id = 'events';
  readonly order = 86;
  /** событие, ожидающее решения */
  pending: { id: string; day: number } | null = null;
  resolved = 0;
  private _game!: Game;
  private _serial = 0;

  init(game: Game): void {
    this._game = game;
    game.bus.on('time:month', () => this._roll());
  }

  def(id: string): CityEventDef | undefined {
    return CITY_EVENTS.find((e) => e.id === id);
  }

  /** Бросает кубик: возможно, начинается новое событие. */
  private _roll(): void {
    const g = this._game;
    const c = g.config.events;
    if (this.pending) return this._expire();
    const pop = g.get('stats').population;
    if (pop < c.minPopulation || Math.random() > c.chancePerMonth) return;
    const active = new Set(g.get('mods').active.map((m) => m.id));
    const pool = CITY_EVENTS.filter((e) => pop >= e.minPop && !active.has(`event:${e.id}`));
    if (!pool.length) return;
    let x = Math.random() * pool.reduce((s, e) => s + e.weight, 0);
    let pick = pool[0];
    for (const e of pool) {
      x -= e.weight;
      if (x <= 0) {
        pick = e;
        break;
      }
    }
    this.start(pick.id);
  }

  start(id: string): void {
    if (!this.def(id)) return;
    this.pending = { id, day: this._game.get('time').totalDays };
    this._game.message('msg.eventNew', { name: t(`event.${id}.title`) }, 'warn');
    this._game.sfx('alarm');
    this._game.bus.emit('event:show');
  }

  /** Решение не принято вовремя — применяется вариант по умолчанию (последний). */
  private _expire(): void {
    const p = this.pending;
    if (!p) return;
    const d = this.def(p.id);
    if (d && this._game.get('time').totalDays - p.day >= this._game.config.events.expireDays) this.choose(d.options[d.options.length - 1].id, true);
  }

  costOf(o: CityEventOption): number {
    return o.cost ? Math.round(o.cost(this._game.get('stats').population)) : 0;
  }

  gainOf(o: CityEventOption): number {
    return o.money ? Math.round(o.money(this._game.get('stats').population)) : 0;
  }

  /** Применяет вариант; false — не хватает денег. */
  choose(optionId: string, auto = false): boolean {
    const p = this.pending;
    const g = this._game;
    const d = p && this.def(p.id);
    const o = d?.options.find((x) => x.id === optionId);
    if (!p || !d || !o) return false;
    const cost = this.costOf(o);
    if (cost > 0 && !g.get('economy').spend(cost)) {
      g.message('err.money', undefined, 'bad');
      return false;
    }
    const gain = this.gainOf(o);
    if (gain) g.get('economy').money += gain;
    if (o.days && (o.mul || o.add)) {
      g.get('mods').put({
        id: `event:${d.id}`,
        icon: d.icon,
        nameKey: `event.${d.id}.title`,
        until: g.get('time').totalDays + o.days,
        mul: o.mul,
        add: o.add,
      });
    }
    this.pending = null;
    this.resolved++;
    this._serial++;
    g.bus.emit('economy:changed');
    g.bus.emit('event:show');
    g.message('msg.eventDone', { name: t(`event.${d.id}.opt.${o.id}`), gain: gain ? fmtMoney(gain) : '' }, auto ? 'warn' : 'info');
    return true;
  }

  get serial(): number {
    return this._serial;
  }
}
