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
  /** видимый спрос −1..1 (с поправкой на пустующие и строящиеся здания) */
  values: Record<string, number> = {};
  /** сырой спрос по экономике (для эмиграции и улучшения зданий) */
  raw: Record<string, number> = {};
  formulas = new Map<string, () => number>();
  private _game!: Game;
  private _timer = 0;

  init(game: Game): void {
    this._game = game;
    const st = game.get('stats');
    const eco = game.get('economy');
    const c = game.config.demand;
    const taxPenalty = (z: string): number => ((eco.taxes[z] ?? c.taxSlack) - c.taxSlack) * c.taxK;
    this.formulas.set('res', () => {
      const gap = (st.jobsTotal - st.workforce) / Math.max(c.res.minScale, st.jobsTotal + st.workforce);
      return gap * c.res.gapK + c.res.base + (st.happiness - 0.5) * c.res.happinessK - taxPenalty('res');
    });
    this.formulas.set('com', () => {
      const need = st.population * c.com.popRatio;
      return ((need - st.jobsCom) / Math.max(c.com.minScale, need + st.jobsCom)) * c.com.gapK + c.com.base - taxPenalty('com');
    });
    this.formulas.set('ind', () => {
      const idle = st.workforce - st.jobsTotal;
      return (idle / Math.max(c.ind.minScale, st.workforce + st.jobsTotal)) * c.ind.gapK + c.ind.base - taxPenalty('ind') - st.pollution * c.ind.pollutionK;
    });
    for (const z of game.zoneTypes.all()) this.values[z.id] = this.raw[z.id] = 0;
  }

  /** Незанятая доля мощности зоны (с учётом строящегося): гасит спрос, пока построенное не заселено. */
  vacancy(zoneId: string): number {
    const g = this._game;
    const z = g.zoneTypes.require(zoneId);
    let free = 0;
    let total = 0;
    for (const b of g.world.list()) {
      if (b.zone !== zoneId || b.abandoned) continue;
      const cap = z.housing ? (b.con < 1 && b.conKind === 0 ? z.levels[b.level - 1].capacity : b.cap) : b.con < 1 && b.conKind === 0 ? z.levels[b.level - 1].capacity : b.jobs;
      const used = b.con < 1 && b.conKind === 0 ? 0 : z.housing ? b.pop : b.workers;
      total += cap;
      free += Math.max(0, cap - used);
    }
    return free / (total + this._game.config.demand.vacancyScale);
  }

  update(_dt: number, realDt: number): void {
    const c = this._game.config.demand;
    this._timer += realDt;
    if (this._timer < c.interval) return;
    this._timer = 0;
    this.refresh();
  }

  /** Пересчёт спроса со сглаживанием. */
  refresh(): void {
    const c = this._game.config.demand;
    for (const z of this._game.zoneTypes.all()) {
      const f = this.formulas.get(z.id);
      const target = clamp((f ? f() : 0) + this._game.get('mods').add(`demand${z.id[0].toUpperCase()}${z.id.slice(1)}`), -1, 1);
      const cur = this.raw[z.id] ?? 0;
      this.raw[z.id] = cur + (target - cur) * c.smoothing;
      // видимый спрос: пока много пустующего и строящегося, новым зданиям места не нужно
      const eff = clamp(this.raw[z.id] - c.vacancyK * this.vacancy(z.id), -1, 1);
      this.values[z.id] = this._game.cheats.maxDemand ? 1 : eff;
    }
  }
}
