import type { Game } from '../core/Game';
import type { System } from '../core/System';

declare module '../core/Game' {
  interface SystemMap {
    stats: StatsSystem;
  }
}

/** Сводные показатели города (обновляются ~2 раза в секунду). */
export class StatsSystem implements System {
  readonly id = 'stats';
  readonly order = 33;
  population = 0;
  jobsCom = 0;
  jobsInd = 0;
  jobsOther = 0;
  jobsTotal = 0;
  workforce = 0;
  employed = 0;
  /** 0..1 */
  unemployment = 0;
  happiness = 0.5;
  education = 0;
  pollution = 0;
  crime = 0;
  /** средняя относительная скорость трафика 0..1 */
  trafficFlow = 1;
  buildings = 0;
  abandoned = 0;
  private _game!: Game;
  private _timer = 0;

  init(game: Game): void {
    this._game = game;
  }

  update(_dt: number, realDt: number): void {
    this._timer += realDt;
    if (this._timer < this._game.config.stats.interval) return;
    this._timer = 0;
    this.recompute();
  }

  recompute(): void {
    const g = this._game;
    const c = g.config.stats;
    const maps = g.get('maps');
    let pop = 0;
    let jc = 0;
    let ji = 0;
    let jo = 0;
    let hapSum = 0;
    let eduSum = 0;
    let crimeSum = 0;
    let polSum = 0;
    let n = 0;
    this.abandoned = 0;
    const list = g.world.list();
    for (const b of list) {
      if (b.abandoned) {
        this.abandoned++;
        continue;
      }
      const live = b.powered && b.watered && b.access > 0;
      if (b.kind === 'zone') {
        if (g.zoneTypes.require(b.zone).housing) {
          pop += b.pop;
          hapSum += b.happiness * b.pop;
          eduSum += maps.sample('education', b.x, b.z) * b.pop;
          crimeSum += (1 - maps.sample('police', b.x, b.z)) * b.pop;
          polSum += maps.sample('pollution', b.x, b.z) * b.pop;
          n += b.pop;
        } else if (live) {
          if (b.zone === 'com') jc += b.jobs;
          else if (b.zone === 'ind') ji += b.jobs;
          else jo += b.jobs;
        }
      } else if (live) jo += b.jobs;
    }
    this.population = Math.round(pop);
    this.jobsCom = jc;
    this.jobsInd = ji;
    this.jobsOther = jo;
    this.jobsTotal = jc + ji + jo;
    this.workforce = pop * (c.workforceRatio + c.educationBonus * (n ? eduSum / n : 0));
    this.employed = Math.min(this.workforce, this.jobsTotal);
    this.unemployment = this.workforce > c.unemploymentMinWorkforce ? 1 - this.employed / this.workforce : 0;
    this.happiness = n ? hapSum / n : 0.5;
    this.education = n ? eduSum / n : 0;
    this.crime = n ? (crimeSum / n) * Math.min(1, pop / c.crimeScalePop) * c.crimeK : 0;
    this.pollution = n ? polSum / n : 0;
    this.buildings = list.length;
    this.trafficFlow = g.get('traffic').flow;

    const fill = this.jobsTotal > 0 ? Math.min(1, this.workforce / this.jobsTotal) : 0;
    for (const b of list) {
      b.workers = g.zoneTypes.get(b.zone)?.housing || b.abandoned ? 0 : b.jobs * fill;
    }
  }
}
