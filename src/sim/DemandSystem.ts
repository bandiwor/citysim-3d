import type { Game } from '../core/Game';
import type { System } from '../core/System';
import { clamp } from '../core/Rng';

declare module '../core/Game' {
  interface SystemMap {
    demand: DemandSystem;
  }
}

/** Спрос RCI в диапазоне [-1, 1] по каждой зоне (id зоны → значение). Новые зоны добавляют свою формулу в `formulas`. */
export class DemandSystem implements System {
  readonly id = 'demand';
  readonly order = 34;
  values: Record<string, number> = {};
  formulas = new Map<string, () => number>();
  private _game!: Game;
  private _timer = 0;

  init(game: Game): void {
    this._game = game;
    const st = game.get('stats');
    const eco = game.get('economy');
    const taxPenalty = (z: string): number => ((eco.taxes[z] ?? 9) - 9) * 0.045;
    this.formulas.set('res', () => {
      const gap = (st.jobsTotal - st.workforce) / Math.max(60, st.jobsTotal + st.workforce);
      const hap = (st.happiness - 0.5) * 0.7;
      return gap * 1.5 + 0.3 + hap - taxPenalty('res');
    });
    this.formulas.set('com', () => {
      const need = st.population * 0.28;
      return ((need - st.jobsCom) / Math.max(40, need + st.jobsCom)) * 1.6 + 0.12 - taxPenalty('com');
    });
    this.formulas.set('ind', () => {
      const idle = st.workforce - st.jobsTotal;
      return (idle / Math.max(60, st.workforce + st.jobsTotal)) * 1.3 + 0.2 - taxPenalty('ind') - st.pollution * 0.3;
    });
    for (const z of game.zoneTypes.all()) this.values[z.id] = 0;
  }

  update(_dt: number, realDt: number): void {
    this._timer += realDt;
    if (this._timer < 0.5) return;
    this._timer = 0;
    for (const z of this._game.zoneTypes.all()) {
      const f = this.formulas.get(z.id);
      const target = clamp(f ? f() : 0, -1, 1);
      const cur = this.values[z.id] ?? 0;
      this.values[z.id] = cur + (target - cur) * 0.35;
    }
  }
}
