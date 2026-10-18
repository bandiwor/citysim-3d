import { isIdle } from '../core/types';
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
    this.enabled = game.config.disasters.enabled;
    game.bus.on('time:month', () => {
      const c = game.config.disasters;
      if (this.enabled && game.get('progress').isUnlocked('service:fire') && game.world.buildings.size > c.minBuildings && Math.random() < c.firePerMonth * game.get('mods').mul('fire')) this.ignite();
    });
  }

  ignite(target?: Building): void {
    const list = this._game.world.list().filter((b) => b.kind === 'zone' && !isIdle(b) && !b.fire);
    const b = target ?? list[Math.floor(Math.random() * list.length)];
    if (!b) return;
    b.fire = 0.001;
    this._game.bus.emit('building:updated', b);
    this._game.message('msg.fire', undefined, 'bad');
    this._game.sfx('alarm');
  }

  update(dt: number): void {
    if (dt <= 0) return;
    const g = this._game;
    const c = g.config.disasters;
    this._acc += dt;
    if (this._acc < c.interval) return;
    const step = this._acc;
    this._acc = 0;
    const maps = g.get('maps');
    for (const b of g.world.list().filter((x) => x.fire > 0)) {
      const cov = maps.sample('fire', b.x, b.z);
      if (Math.random() < (c.extinguishBase + cov * c.extinguishCoverage) * step) {
        b.fire = 0;
        g.bus.emit('building:updated', b);
        g.message('msg.fireOut', undefined, 'good');
        continue;
      }
      b.fire += step;
      // огонь перекидывается на соседей: чем дольше горит и чем слабее покрытие, тем вероятнее; число пожаров ограничено
      const fires = g.world.list().filter((x) => x.fire > 0).length;
      const maxFires = Math.max(c.minFires, Math.floor(g.world.buildings.size * c.maxFireShare));
      const p = c.spreadChance * (1 - cov * c.coverageSpreadCut) * (0.5 + b.fire / c.burnTime) * step;
      if (fires < maxFires && Math.random() < p) {
        const near = g.world.buildingsNear(b.x, b.z, c.spreadDistance).filter((n) => n.id !== b.id && n.kind === 'zone' && !isIdle(n) && !n.fire);
        if (near.length) {
          this.ignite(near[Math.floor(Math.random() * near.length)]);
          g.message('msg.fireSpread', undefined, 'bad');
        }
      }
      if (b.fire > c.burnTime) {
        g.builder.removeBuilding(b);
        g.message('msg.burned', undefined, 'bad');
      }
    }
  }
}
