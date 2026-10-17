import type { Game } from '../core/Game';
import type { System } from '../core/System';
import type { Building } from '../core/types';

declare module '../core/Game' {
  interface SystemMap {
    disaster: DisasterSystem;
  }
}

/** Пожары: случайно загораются здания; пожарные части с покрытием тушат огонь, иначе здание сгорает. */
export class DisasterSystem implements System {
  readonly id = 'disaster';
  readonly order = 70;
  enabled = true;
  private _game!: Game;
  private _acc = 0;

  init(game: Game): void {
    this._game = game;
    game.bus.on('time:month', () => {
      if (this.enabled && game.world.buildings.size > 14 && Math.random() < 0.22) this.ignite();
    });
  }

  ignite(target?: Building): void {
    const list = this._game.world.list().filter((b) => b.kind === 'zone' && !b.abandoned && !b.fire);
    const b = target ?? list[Math.floor(Math.random() * list.length)];
    if (!b) return;
    b.fire = 0.001;
    this._game.bus.emit('building:updated', b);
    this._game.message('Пожар в городе!', 'bad');
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this._acc += dt;
    if (this._acc < 0.5) return;
    const step = this._acc;
    this._acc = 0;
    const g = this._game;
    const fireCov = g.get('maps').coverage('fire');
    const burning = g.world.list().filter((b) => b.fire > 0);
    for (const b of burning) {
      const cov = fireCov[b.cell];
      if (Math.random() < (0.04 + cov * 0.7) * step) {
        b.fire = 0;
        g.bus.emit('building:updated', b);
        g.message('Пожар потушен', 'good');
        continue;
      }
      b.fire += step;
      if (cov < 0.35 && Math.random() < 0.05 * step) {
        const nb = g.world.buildingAt(b.x + (Math.random() < 0.5 ? -1 : 1), b.y + (Math.random() < 0.5 ? -1 : 1));
        if (nb && nb.kind === 'zone' && !nb.fire) this.ignite(nb);
      }
      if (b.fire > 16) {
        g.builder.removeBuilding(b);
        g.message('Здание сгорело дотла', 'bad');
      }
    }
  }
}
