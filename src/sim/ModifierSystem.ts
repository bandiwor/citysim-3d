import type { Game } from '../core/Game';
import type { System } from '../core/System';

declare module '../core/Game' {
  interface SystemMap {
    mods: ModifierSystem;
  }
}

/** Временный или постоянный эффект: политика, событие, бонус. */
export interface Modifier {
  id: string;
  icon: string;
  /** ключ i18n названия */
  nameKey: string;
  /** игровой день (time.totalDays), когда эффект заканчивается; null — бессрочно */
  until: number | null;
  /** множители: garbage, crime, fire, death, income, powerDemand, fare, transitShare… */
  mul?: Record<string, number>;
  /** добавки: happiness, demandRes/Com/Ind… */
  add?: Record<string, number>;
}

/**
 * Единое место для «правил поверх правил»: политики и события не правят системы напрямую, а выдают модификаторы,
 * которые системы читают через `mods.mul('crime')` / `mods.add('happiness')`.
 */
export class ModifierSystem implements System {
  readonly id = 'mods';
  readonly order = 1;
  active: Modifier[] = [];
  private _game!: Game;
  private _cache = new Map<string, number>();

  init(game: Game): void {
    this._game = game;
    game.bus.on('time:day', () => this._expire());
  }

  /** Добавляет эффект (эффект с тем же id заменяется). */
  put(m: Modifier): void {
    this.active = this.active.filter((x) => x.id !== m.id);
    this.active.push(m);
    this._changed();
  }

  remove(id: string): void {
    const n = this.active.length;
    this.active = this.active.filter((x) => x.id !== id);
    if (this.active.length !== n) this._changed();
  }

  /** Произведение множителей по ключу (1 — нет эффекта). */
  mul(key: string): number {
    const k = `m:${key}`;
    let v = this._cache.get(k);
    if (v === undefined) {
      v = 1;
      for (const m of this.active) if (m.mul && key in m.mul) v *= m.mul[key];
      this._cache.set(k, v);
    }
    return v;
  }

  /** Сумма добавок по ключу (0 — нет эффекта). */
  add(key: string): number {
    const k = `a:${key}`;
    let v = this._cache.get(k);
    if (v === undefined) {
      v = 0;
      for (const m of this.active) if (m.add && key in m.add) v += m.add[key];
      this._cache.set(k, v);
    }
    return v;
  }

  /** Сколько дней осталось у временного эффекта. */
  daysLeft(m: Modifier): number | null {
    return m.until === null ? null : Math.max(0, m.until - this._game.get('time').totalDays);
  }

  private _expire(): void {
    const now = this._game.get('time').totalDays;
    const n = this.active.length;
    this.active = this.active.filter((m) => m.until === null || m.until > now);
    if (this.active.length !== n) this._changed();
  }

  private _changed(): void {
    this._cache.clear();
    this._game.bus.emit('mods:changed');
  }
}
