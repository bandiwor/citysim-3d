import type { Game } from '../core/Game';
import type { System } from '../core/System';
import type { Building } from '../core/types';

declare module '../core/Game' {
  interface SystemMap {
    taxi: TaxiSystem;
  }
}

/**
 * Такси: часть поездок на личной машине совершается на такси из таксопарка (остановки не нужны, машину вызывают на дом).
 * Такси едет к дому, везёт пассажира к цели и возвращается в парк; поездка приносит выручку. Такси забирает у города
 * личные машины, но ездит и порожняком, поэтому парк не бесконечно разгружает дороги.
 */
export class TaxiSystem implements System {
  readonly id = 'taxi';
  readonly order = 53;
  /** поездок и выручка за последние месяцы */
  tripsMonth = 0;
  fareMonth = 0;
  private _game!: Game;

  init(game: Game): void {
    this._game = game;
    game.bus.on('time:month', () => {
      this.tripsMonth = 0;
      this.fareMonth = 0;
    });
  }

  get depots(): Building[] {
    return this._game.get('fleet').facilities('taxi');
  }

  /** Количество работающих такси в городе. */
  get active(): number {
    const fleet = this._game.get('fleet');
    return this.depots.reduce((n, d) => n + fleet.active(d), 0);
  }

  /**
   * Пробует отправить такси вместо личной машины. true — поездка взята такси (обычную машину создавать не нужно).
   */
  tryTrip(home: Building, dest: Building): boolean {
    const g = this._game;
    const c = g.config.taxi;
    const depots = this.depots;
    if (!depots.length) return false;
    const fleet = g.get('fleet');
    const share = Math.min(c.shareMax, c.share * g.get('mods').mul('taxiShare'));
    if (Math.random() >= share) return false;
    const depot = fleet.nearest('taxi', home, (f) => Math.hypot(f.x - home.x, f.z - home.z) <= c.range);
    if (!depot || dest.comp !== home.comp) return false;
    const dist = Math.hypot(dest.x - home.x, dest.z - home.z);
    const fare = (c.fareBase + c.farePerUnit * dist) * g.get('mods').mul('fare');
    return fleet.launch(
      depot,
      home,
      0xf2c230,
      {
        onVia: () => {
          this.tripsMonth++;
          this.fareMonth += fare;
          g.get('economy').earnTransit(fare);
        },
      },
      dest,
    );
  }
}
