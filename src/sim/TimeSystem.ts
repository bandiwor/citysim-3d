import type { Game } from '../core/Game';
import type { System } from '../core/System';

declare module '../core/Game' {
  interface SystemMap {
    time: TimeSystem;
  }
}

export const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

/** Календарь и время суток. Сутки (tod) идут независимо от календарных дней — чтобы смена дня/ночи была плавной. */
export class TimeSystem implements System {
  readonly id = 'time';
  readonly order = 0;
  /** секунд на игровой день при скорости ×1 */
  static readonly DAY_LENGTH = 2.5;
  static readonly TOD_LENGTH = 110;
  day = 1;
  month = 0;
  year = 2025;
  /** время суток 0..1 (0.5 — полдень) */
  tod = 0.42;
  totalDays = 0;
  private _acc = 0;
  private _game!: Game;

  init(game: Game): void {
    this._game = game;
  }

  update(dt: number): void {
    this.tod = (this.tod + dt / TimeSystem.TOD_LENGTH) % 1;
    this._acc += dt;
    while (this._acc >= TimeSystem.DAY_LENGTH) {
      this._acc -= TimeSystem.DAY_LENGTH;
      this.day++;
      this.totalDays++;
      this._game.bus.emit('time:day');
      if (this.day > 30) {
        this.day = 1;
        this.month++;
        this._game.bus.emit('time:month');
        if (this.month > 11) {
          this.month = 0;
          this.year++;
          this._game.bus.emit('time:year');
        }
      }
    }
  }

  get label(): string {
    return `${this.day} ${MONTHS[this.month]} ${this.year}`;
  }
}
