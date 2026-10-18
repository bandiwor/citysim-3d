import { isBuilding } from '../core/types';
import type { Game } from '../core/Game';
import type { System } from '../core/System';
import type { MessageParams } from '../core/types';
import { fmtNumber } from '../i18n';

declare module '../core/Game' {
  interface SystemMap {
    advisor: AdvisorSystem;
  }
}

export interface Issue {
  id: string;
  sev: 'bad' | 'warn' | 'info';
  icon: string;
  /** ключ i18n: `advisor.<id>` */
  key: string;
  params?: MessageParams;
  /** где смотреть на карте */
  x?: number;
  z?: number;
}

/** Советник: следит за городом и перечисляет проблемы с привязкой к месту на карте. */
export class AdvisorSystem implements System {
  readonly id = 'advisor';
  readonly order = 95;
  issues: Issue[] = [];
  private _game!: Game;
  private _acc = 0;

  init(game: Game): void {
    this._game = game;
  }

  update(_dt: number, realDt: number): void {
    this._acc += realDt;
    if (this._acc < 2) return;
    this._acc = 0;
    this.refresh();
  }

  refresh(): void {
    const g = this._game;
    const st = g.get('stats');
    const u = g.get('utility');
    const san = g.get('sanitation');
    const pop = st.population;
    const list = g.world.list().filter((b) => !isBuilding(b));
    const out: Issue[] = [];
    const sev = (s: Issue['sev'], id: string, icon: string, params?: MessageParams, at?: { x: number; z: number }): void => {
      out.push({ id, sev: s, icon, key: `advisor.${id}`, params, x: at?.x, z: at?.z });
    };
    const first = <T extends { x: number; z: number }>(arr: T[]): T | undefined => arr[0];
    const has = (pred: (b: (typeof list)[number]) => boolean): boolean => list.some(pred);
    const services = (id: string): boolean => has((b) => b.kind === 'service' && b.defId === id);

    const fires = list.filter((b) => b.fire > 0);
    if (fires.length) sev('bad', 'fire', '🔥', { n: fires.length }, first(fires));
    const robberies = list.filter((b) => b.incident > 0);
    if (robberies.length) sev('bad', 'robbery', '🚨', { n: robberies.length }, first(robberies));

    if (list.length && u.powerSupply <= 0) sev('bad', 'noPower', '⚡');
    else if (u.powerDemand > u.powerSupply) sev('bad', 'powerShort', '⚡', { n: fmtNumber(u.powerDemand - u.powerSupply) });
    if (list.length && u.waterSupply <= 0) sev('bad', 'noWater', '💧');
    else if (u.waterDemand > u.waterSupply) sev('bad', 'waterShort', '💧', { n: fmtNumber(u.waterDemand - u.waterSupply) });

    const dark = list.filter((b) => !b.abandoned && b.kind === 'zone' && b.access > 0 && (!b.powered || !b.watered));
    if (dark.length && u.powerSupply > 0 && u.waterSupply > 0) sev('warn', 'disconnected', '🔌', { n: dark.length }, first(dark));
    const noRoad = list.filter((b) => !b.abandoned && b.kind === 'zone' && !b.access);
    if (noRoad.length) sev('warn', 'noRoad', '🚧', { n: noRoad.length }, first(noRoad));
    const dead = list.filter((b) => b.abandoned);
    if (dead.length) sev('warn', 'abandoned', '🏚️', { n: dead.length }, first(dead));

    const sick = list.filter((b) => b.pop > 0 && b.sick / b.pop >= g.config.disease.spreadThreshold);
    if (sick.length) sev('warn', 'epidemic', '🤒', { n: sick.length }, first(sick));
    const over = list.filter((b) => b.garbage > g.config.garbage.cap * g.config.garbage.unhappyAt);
    if (over.length) sev('warn', 'garbage', '🗑️', { n: over.length }, first(over));
    if (pop > 120 && !services('landfill') && !services('incinerator') && !services('recycling')) sev('warn', 'noLandfill', '🗑️');
    if (san.wasteFill > 0.9) sev('bad', 'wasteFull', '🗑️');
    if (san.bodiesWaiting > 5) sev('warn', 'bodies', '⚰️', { n: san.bodiesWaiting });
    if (pop > 300 && !services('cemetery') && !services('crematorium')) sev('info', 'noCemetery', '🪦');
    if (san.morgueFill > 0.9) sev('bad', 'morgueFull', '⚰️');

    if (pop > 150 && st.unemployment > 0.15) sev('warn', 'unemployment', '💼', { n: Math.round(st.unemployment * 100) });
    if (pop > 150 && st.jobsTotal > st.workforce * 1.35 + 20) sev('info', 'needWorkers', '👥');
    if (pop > 400 && st.trafficFlow < 0.55) sev('warn', 'traffic', '🚗', { n: Math.round(st.trafficFlow * 100) });
    if (pop > 200 && !services('police') && !services('policehq')) sev('info', 'noPolice', '🚓');
    if (pop > 200 && !services('fire') && !services('firehq')) sev('info', 'noFire', '🚒');
    if (pop > 400 && !services('clinic') && !services('hospital')) sev('info', 'noHealth', '🏥');
    if (pop > 500 && st.education < 0.2) sev('info', 'noSchool', '🏫');
    if (st.happiness < 0.35 && pop > 100) sev('warn', 'unhappy', '😟', { n: Math.round(st.happiness * 100) });

    const eco = g.get('economy');
    const net = (eco.last ?? eco.computeBudget()).net;
    if (eco.money < 0) sev('bad', 'broke', '💸');
    else if (net < 0 && eco.money < -net * 6) sev('warn', 'deficit', '📉', { n: Math.round(net) });
    for (const r of g.get('transit').routes) {
      if (r.status === 'noDepot') {
        sev('warn', 'noDepot', '🚌');
        break;
      }
    }
    for (const r of g.get('transit').routes) {
      if (r.status === 'broken') {
        sev('warn', 'routeBroken', '🛑', { n: r.id });
        break;
      }
    }
    const order = { bad: 0, warn: 1, info: 2 };
    out.sort((a, b) => order[a.sev] - order[b.sev]);
    this.issues = out;
  }
}
