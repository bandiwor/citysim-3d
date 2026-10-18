import type { Game } from '../core/Game';
import type { System } from '../core/System';
import { isIdle } from '../core/types';
import { effectiveDef } from '../data/services';

declare module '../core/Game' {
  interface SystemMap {
    tourism: TourismSystem;
  }
}

export interface TourismFactors {
  /** сумма привлекательности достопримечательностей, парков и берега */
  base: number;
  happiness: number;
  safety: number;
  /** сезон и погода (модификатор 'tourism') */
  season: number;
  /** туристы добираются только через выезды к соседям; общественный транспорт и инфоцентры добавляют */
  access: number;
}

/**
 * Туризм: достопримечательности, парки и пляжи притягивают гостей из соседних городов (нужен выезд к соседям).
 * Поток зависит от счастья горожан, безопасности, сезона и погоды; гостям нужны места в отелях и коммерции.
 * Туристы тратят деньги (строка бюджета «Туризм») и поднимают спрос на коммерцию; гуляют у достопримечательностей.
 */
export class TourismSystem implements System {
  readonly id = 'tourism';
  readonly order = 58;
  /** туристов в месяц (сглажено) */
  tourists = 0;
  /** рекорд для целей и статистики */
  peak = 0;
  history: number[] = [];
  private _game!: Game;
  private _timer = 0;
  private _bonus = 0;

  init(game: Game): void {
    this._game = game;
    game.bus.on('time:month', () => {
      this.history.push(Math.round(this.tourists));
      while (this.history.length > 24) this.history.shift();
    });
  }

  /** Достопримечательности с их вкладом (для панели), по убыванию. */
  attractions(): { id: number; defId: string; points: number }[] {
    const g = this._game;
    const out: { id: number; defId: string; points: number }[] = [];
    const maps = g.get('maps');
    for (const b of g.world.list()) {
      if (b.kind !== 'service' || isIdle(b)) continue;
      const d = effectiveDef(g.services.require(b.defId), b.up);
      if (!d.attraction) continue;
      // у воды и в ухоженных местах (высокая стоимость земли) — привлекательнее
      const shore = maps.sample('shore', b.x, b.z);
      const pts = d.attraction * (1 + Math.min(0.5, shore) + 0.3 * maps.sample('landValue', b.x, b.z)) * (b.powered ? 1 : 0.5);
      out.push({ id: b.id, defId: b.defId, points: pts });
    }
    return out.sort((a, b) => b.points - a.points);
  }

  factors(): TourismFactors {
    const g = this._game;
    const st = g.get('stats');
    const trade = g.get('trade');
    // одинаковые достопримечательности приедаются: каждая следующая того же типа даёт меньше
    const seen = new Map<string, number>();
    let base = 0;
    for (const a of this.attractions()) {
      const n = seen.get(a.defId) ?? 0;
      seen.set(a.defId, n + 1);
      base += a.points / (1 + n * 0.6);
    }
    let infos = 0;
    for (const b of g.world.list()) if (b.kind === 'service' && b.defId === 'touristinfo' && !isIdle(b)) infos++;
    const routes = g.get('transit').routes.length;
    const access = trade?.connected ? Math.min(1.6, 1 + 0.05 * Math.min(4, routes) + 0.1 * Math.min(3, infos) + 0.05 * Math.min(4, trade.links.length - 1)) : 0;
    return {
      base,
      happiness: 0.5 + st.happiness,
      safety: 1 - 0.6 * Math.min(1, st.crime),
      season: g.get('mods').mul('tourism'),
      access,
    };
  }

  /** Сколько туристов город может принять за месяц: отели и коммерция. */
  beds(): number {
    const g = this._game;
    let beds = 0;
    for (const b of g.world.list()) {
      if (isIdle(b)) continue;
      if (b.kind === 'service') beds += effectiveDef(g.services.require(b.defId), b.up).beds ?? 0;
      else if (b.zone === 'com' && b.level >= 2) beds += Math.round((b.jobs / 10) * g.config.tourism.comBeds);
    }
    return beds;
  }

  /** Желаемый поток без учёта мест. */
  demand(): number {
    const f = this.factors();
    return f.base * f.happiness * f.safety * f.season * f.access * this._game.config.tourism.perPoint;
  }

  /** Выручка за месяц ($). */
  income(): number {
    return this.tourists * this._game.config.tourism.spend;
  }

  update(_dt: number, realDt: number): void {
    this._timer += realDt;
    if (this._timer < 1) return;
    this._timer = 0;
    const g = this._game;
    const want = Math.min(this.demand(), this.beds());
    // поток меняется плавно (слухи о городе расходятся не сразу)
    this.tourists += (want - this.tourists) * (g.speed > 0 ? 0.08 : 0);
    if (this.tourists < 0.5) this.tourists = 0;
    this.peak = Math.max(this.peak, this.tourists);
    // спрос на коммерцию от туристов (модификатор обновляется только при заметном изменении)
    const k = g.config.tourism.demandComPer1000;
    const bonus = this.tourists > 20 ? Math.round(Math.min(0.2, (this.tourists / 1000) * k) * 200) / 200 : 0;
    if (bonus !== this._bonus) {
      this._bonus = bonus;
      if (bonus > 0) g.get('mods').put({ id: 'tourism', icon: '🧳', nameKey: 'mod.tourism', until: null, add: { demandCom: bonus } });
      else g.get('mods').remove('tourism');
    }
  }

  saveState(): unknown {
    return { t: Math.round(this.tourists), p: Math.round(this.peak), h: this.history };
  }

  loadState(data: unknown): void {
    const d = data as { t?: number; p?: number; h?: number[] } | null;
    this.tourists = d?.t ?? 0;
    this.peak = d?.p ?? 0;
    this.history = Array.isArray(d?.h) ? d.h.slice(-24) : [];
  }
}
