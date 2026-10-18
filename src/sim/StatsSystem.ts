import { isBuilding, isIdle } from '../core/types';
import type { Game } from '../core/Game';
import { SERVICE_EDU_MIX } from '../data/zones';
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
  /** доли рабочей силы: с образованием (всего, включая высшее) и с высшим; растут от школ и университетов */
  eduEducated = 0.06;
  eduHigh = 0;
  /** рабочие места и занятость по уровню образования [нет, среднее, высшее] */
  jobsByEdu: [number, number, number] = [0, 0, 0];
  fillByEdu: [number, number, number] = [1, 1, 1];
  private _game!: Game;
  private _timer = 0;

  init(game: Game): void {
    this._game = game;
  }

  /** Восстановление образования из сохранения. */
  restoreEdu(educated: number, high: number): void {
    this.eduEducated = educated;
    this.eduHigh = high;
  }

  /** Образование растёт медленно: школы со временем делают людей образованными, университеты — высокообразованными. */
  private _educate(dt: number): void {
    const c = this._game.config.education;
    const cov = this.education;
    const rate = c.rate * this._game.get('mods').mul('eduRate');
    const targetAll = Math.min(c.maxEducated, cov * c.coverageMul);
    const targetHigh = Math.min(c.maxHigh, Math.max(0, (cov - c.highThreshold) * c.highMul));
    this.eduEducated += (targetAll - this.eduEducated) * rate * dt;
    this.eduHigh += (targetHigh - this.eduHigh) * rate * c.highSlow * dt;
    this.eduHigh = Math.min(this.eduHigh, this.eduEducated);
  }

  update(dt: number, realDt: number): void {
    if (dt > 0) this._educate(dt);
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
    const jobsEdu: [number, number, number] = [0, 0, 0];
    let hapSum = 0;
    let eduSum = 0;
    let crimeSum = 0;
    let polSum = 0;
    let n = 0;
    this.abandoned = 0;
    const list = g.world.list();
    for (const b of list) {
      if (isBuilding(b)) continue;
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
          const mix = g.zoneTypes.require(b.zone).levels[b.level - 1].eduMix;
          for (let k = 0; k < 3; k++) jobsEdu[k] += b.jobs * mix[k];
        }
      } else if (live) {
        jo += b.jobs;
        for (let k = 0; k < 3; k++) jobsEdu[k] += b.jobs * SERVICE_EDU_MIX[k];
      }
    }
    this.population = Math.round(pop);
    this.jobsCom = jc;
    this.jobsInd = ji;
    this.jobsOther = jo;
    this.jobsTotal = jc + ji + jo;
    this.workforce = pop * (c.workforceRatio + c.educationBonus * (n ? eduSum / n : 0)) * (1 - g.config.disease.workLoss * Math.min(1, g.get('disease').sickShare));
    // трудоустройство по образованию: места для высшего заполняют только они, места попроще могут занять и более образованные
    const wf = this.workforce;
    const w2 = wf * this.eduHigh;
    const w1 = wf * Math.max(0, this.eduEducated - this.eduHigh);
    const w0 = Math.max(0, wf - w1 - w2);
    const [j0, j1, j2] = jobsEdu;
    const f2 = j2 > 0 ? Math.min(1, w2 / j2) : 1;
    const spare2 = Math.max(0, w2 - j2);
    const f1 = j1 > 0 ? Math.min(1, (w1 + spare2) / j1) : 1;
    const spare1 = Math.max(0, w1 + spare2 - j1);
    const f0 = j0 > 0 ? Math.min(1, (w0 + spare1) / j0) : 1;
    this.jobsByEdu = jobsEdu;
    this.fillByEdu = [f0, f1, f2];
    this.employed = Math.min(wf, f0 * j0 + f1 * j1 + f2 * j2);
    this.unemployment = wf > c.unemploymentMinWorkforce ? 1 - this.employed / wf : 0;
    this.happiness = n ? hapSum / n : 0.5;
    this.education = n ? eduSum / n : 0;
    this.crime = n ? (crimeSum / n) * Math.min(1, pop / c.crimeScalePop) * c.crimeK : 0;
    this.pollution = n ? polSum / n : 0;
    this.buildings = list.length;
    this.trafficFlow = g.get('traffic').flow;

    for (const b of list) {
      if (isIdle(b) || g.zoneTypes.get(b.zone)?.housing) {
        b.workers = 0;
        continue;
      }
      const mix = b.kind === 'zone' ? g.zoneTypes.require(b.zone).levels[b.level - 1].eduMix : SERVICE_EDU_MIX;
      b.workers = Math.round(b.jobs * (mix[0] * f0 + mix[1] * f1 + mix[2] * f2));
    }
  }
}
