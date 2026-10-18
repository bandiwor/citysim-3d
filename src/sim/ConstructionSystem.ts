import type { Game } from '../core/Game';
import type { System } from '../core/System';
import type { Building } from '../core/types';

declare module '../core/Game' {
  interface SystemMap {
    construction: ConstructionSystem;
  }
}

/** Стройка зданий по стадиям: у новых — фундамент и каркас с краном, у повышения уровня и улучшений — леса и кран вокруг работающего здания. */
export class ConstructionSystem implements System {
  readonly id = 'construction';
  readonly order = 44;
  /** здания, которые сейчас строятся (для отрисовки) */
  active: Building[] = [];
  private _game!: Game;
  private _version = -1;

  init(game: Game): void {
    this._game = game;
    // стройка начинается и заканчивается событиями здания: список активных пересобираем при любом изменении
    for (const ev of ['building:added', 'building:updated', 'building:removed'] as const) game.bus.on(ev, () => (this._version = -1));
  }

  update(dt: number): void {
    const g = this._game;
    if (g.world.version !== this._version) {
      this._version = g.world.version;
      this.active = g.world.list().filter((b) => b.con < 1);
    }
    if (dt <= 0 || !this.active.length) return;
    let done = false;
    for (const b of this.active) {
      b.con = Math.min(1, b.con + dt / Math.max(1, b.conDur));
      if (b.con >= 1) {
        g.builder.finishBuild(b);
        done = true;
      }
    }
    if (done) this.active = this.active.filter((b) => b.con < 1);
  }

  /** Стадия новой стройки: 0 — фундамент, затем рост каркаса 0..1. */
  frameProgress(b: Building): number {
    const f = this._game.config.construction.foundationShare;
    return Math.max(0, Math.min(1, (b.con - f) / (1 - f)));
  }
}
