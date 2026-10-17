import type { Game } from '../core/Game';
import type { System } from '../core/System';
import { t } from '../i18n';

declare module '../core/Game' {
  interface SystemMap {
    progress: ProgressSystem;
  }
}

/**
 * Прогресс города: уровни по пиковому населению, награды за уровни и открытие содержимого (дороги, службы, политики).
 * В песочнице (`config.progress.enabled = false`) открыто всё.
 */
export class ProgressSystem implements System {
  readonly id = 'progress';
  readonly order = 3;
  /** наибольшая численность за всю игру: потеря жителей не закрывает уже открытое */
  peakPop = 0;
  level = 0;
  private _game!: Game;
  private _acc = 0;

  init(game: Game): void {
    this._game = game;
    this.level = this._levelFor(this.peakPop);
  }

  get enabled(): boolean {
    return this._game.config.progress.enabled;
  }

  get levels(): readonly { id: string; pop: number; reward: number }[] {
    return this._game.config.progress.levels;
  }

  /** Восстановление из сохранения. */
  restore(peak: number): void {
    this.peakPop = peak;
    this.level = this._levelFor(peak);
  }

  /** Ключ открытия для кнопки панели инструментов по её id. */
  toolKey(toolId: string): string {
    return toolId.startsWith('road:') || toolId.startsWith('service:') ? toolId : `tool:${toolId}`;
  }

  /** Порог населения, при котором открывается содержимое (0 — открыто сразу). */
  unlockPop(key: string): number {
    return this._game.config.progress.unlocks[key] ?? 0;
  }

  isUnlocked(key: string): boolean {
    return !this.enabled || this.peakPop >= this.unlockPop(key);
  }

  populationUnlocked(pop: number): boolean {
    return !this.enabled || this.peakPop >= pop;
  }

  /** Доля пути до следующего уровня 0..1 (1 — максимум). */
  progressToNext(): number {
    const next = this.levels[this.level + 1];
    if (!next) return 1;
    const cur = this.levels[this.level];
    return Math.min(1, Math.max(0, (this.peakPop - cur.pop) / (next.pop - cur.pop)));
  }

  /** Названия содержимого, которое откроется на уровне (для панели). */
  unlocksAt(from: number, to: number): string[] {
    const out: string[] = [];
    const u = this._game.config.progress.unlocks;
    for (const [key, need] of Object.entries(u)) if (need > from && need <= to) out.push(key);
    for (const p of this._game.policies.all()) if (p.unlock > from && p.unlock <= to) out.push(`policy:${p.id}`);
    return out;
  }

  /** Читаемое название содержимого по ключу `<тип>:<id>`. */
  nameOf(key: string): string {
    const i = key.indexOf(':');
    const kind = key.slice(0, i);
    const id = key.slice(i + 1);
    if (kind === 'tool') return t(`tool.${id.replace(':', '.')}.name`);
    return t(`${kind}.${id}.name`);
  }

  update(_dt: number, realDt: number): void {
    this._acc += realDt;
    if (this._acc < 1) return;
    this._acc = 0;
    const pop = this._game.get('stats').population;
    if (pop <= this.peakPop) return;
    const before = this.peakPop;
    this.peakPop = pop;
    this._announceUnlocks(before, pop);
    const lv = this._levelFor(pop);
    while (this.level < lv) {
      this.level++;
      const def = this.levels[this.level];
      if (this.enabled && def.reward) this._game.get('economy').money += def.reward;
      this._game.message('msg.levelUp', { name: t(`level.${def.id}`), reward: def.reward }, 'good');
      this._game.sfx('levelup');
      this._game.bus.emit('progress:level', this.level);
      this._game.bus.emit('economy:changed');
    }
  }

  private _levelFor(pop: number): number {
    let lv = 0;
    this.levels.forEach((l, i) => {
      if (pop >= l.pop) lv = i;
    });
    return lv;
  }

  private _announceUnlocks(from: number, to: number): void {
    if (!this.enabled) return;
    const names: string[] = [];
    for (const [key, need] of Object.entries(this._game.config.progress.unlocks)) if (need > from && need <= to) names.push(this.nameOf(key));
    for (const p of this._game.policies.all()) if (p.unlock > from && p.unlock <= to) names.push(t(`policy.${p.id}.name`));
    if (names.length) {
      this._game.message('msg.unlocked', { list: names.join(', ') }, 'info');
      this._game.bus.emit('tool:unlocked');
    }
  }
}
