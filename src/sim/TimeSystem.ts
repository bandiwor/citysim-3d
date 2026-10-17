import type { Game } from '../core/Game';
import type { System } from '../core/System';

declare module '../core/Game' {
  interface SystemMap {
    time: TimeSystem;
  }
}

/** Календарь и время суток. Сутки (tod) идут независимо от календарных дней — чтобы смена дня/ночи была плавной. */
export class TimeSystem implements System {
  readonly id = 'time';
  readonly order = 0;
  day = 1;
  month = 0;
  year = 0;
  /** время суток 0..1 (0.5 — полдень) */
  tod = 0;
  totalDays = 0;
  private _acc = 0;
  private _game!: Game;

  init(game: Game): void {
    this._game = game;
    if (this.year === 0) this.year = game.config.time.startYear;
    if (this.tod === 0) this.tod = game.config.time.startTod;
  }

  update(dt: number): void {
    const c = this._game.config.time;
    this.tod = (this.tod + dt / c.todLength) % 1;
    this._acc += dt;
    while (this._acc >= c.dayLength) {
      this._acc -= c.dayLength;
      this.day++;
      this.totalDays++;
      this._game.bus.emit('time:day');
      if (this.day > c.daysPerMonth) {
        this.day = 1;
        this.month++;
        this._game.bus.emit('time:month');
        if (this.month >= c.monthsPerYear) {
          this.month = 0;
          this.year++;
          this._game.bus.emit('time:year');
        }
      }
    }
  }
}
