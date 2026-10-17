import type { Game } from '../core/Game';
import type { System } from '../core/System';

declare module '../core/Game' {
  interface SystemMap {
    policy: PolicySystem;
  }
}

/** Городские политики: включение/выключение, ежемесячная плата, выдача модификаторов. */
export class PolicySystem implements System {
  readonly id = 'policy';
  readonly order = 2;
  readonly enabled = new Set<string>();
  private _game!: Game;

  init(game: Game): void {
    this._game = game;
    for (const id of this.enabled) this._apply(id);
  }

  has(id: string): boolean {
    return this.enabled.has(id);
  }

  /** Политика открыта по уровню города (в песочнице — всегда). */
  unlocked(id: string): boolean {
    const d = this._game.policies.get(id);
    return !!d && this._game.get('progress').populationUnlocked(d.unlock);
  }

  toggle(id: string): { ok: boolean; reasonKey?: string } {
    const d = this._game.policies.get(id);
    if (!d) return { ok: false, reasonKey: 'err.policy.none' };
    if (this.enabled.has(id)) {
      this.enabled.delete(id);
      this._game.get('mods').remove(`policy:${id}`);
    } else {
      if (!this.unlocked(id)) return { ok: false, reasonKey: 'err.locked' };
      this.enabled.add(id);
      this._apply(id);
    }
    this._game.bus.emit('economy:changed');
    this._game.sfx('tick');
    return { ok: true };
  }

  /** Плата за все включённые политики в месяц. */
  upkeep(): number {
    let sum = 0;
    for (const id of this.enabled) sum += this._game.policies.get(id)?.upkeep ?? 0;
    return sum;
  }

  /** Заново выставляет модификаторы (после загрузки). */
  restore(ids: string[]): void {
    this.enabled.clear();
    for (const id of ids) if (this._game.policies.has(id)) this.enabled.add(id);
  }

  /** Выдать модификатор уже включённой политики (после загрузки). */
  refresh(id: string): void {
    this._apply(id);
  }

  private _apply(id: string): void {
    const d = this._game.policies.get(id);
    if (!d) return;
    this._game.get('mods').put({ id: `policy:${id}`, icon: d.icon, nameKey: `policy.${id}.name`, until: null, mul: d.mul, add: d.add });
  }
}
