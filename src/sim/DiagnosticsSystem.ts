import type { Game } from '../core/Game';
import type { System } from '../core/System';
import { isBuilding, isIdle, type Building } from '../core/types';
import { effectiveDef } from '../data/services';
import type { ZoneCell } from '../world/ZoneGrid';

declare module '../core/Game' {
  interface SystemMap {
    diag: DiagnosticsSystem;
  }
}

export type Severity = 'bad' | 'warn' | 'info' | 'good';

/** Найденная проблема (или хорошая новость): что происходит, почему и что делать. Тексты: `diag.<key>` и `diag.<key>.fix`. */
export interface Issue {
  sev: Severity;
  icon: string;
  key: string;
  params?: Record<string, string | number>;
  /** точка на карте, куда можно перейти */
  focus?: { x: number; z: number };
}

const SEV_ORDER: Record<Severity, number> = { bad: 0, warn: 1, info: 2, good: 3 };
const sorted = (l: Issue[]): Issue[] => l.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);

/**
 * Диагностика: объясняет игроку, почему здания не строятся, почему бюджет в минусе и что портит настроение.
 * Ничего не меняет в игре: только читает состояние других систем.
 */
export class DiagnosticsSystem implements System {
  readonly id = 'diag';
  readonly order = 95;
  private _game!: Game;

  init(game: Game): void {
    this._game = game;
  }

  update(): void {}

  /** Почему растёт / не растёт зона `zoneId`. */
  growth(zoneId: string): Issue[] {
    const g = this._game;
    const z = g.zoneTypes.require(zoneId);
    const c = g.config;
    const st = g.get('stats');
    const eco = g.get('economy');
    const dem = g.get('demand');
    const out: Issue[] = [];
    const zname = g.zoneTypes.require(zoneId).id;
    const cells = g.world.zones.list().filter((x) => x.zone === z.index + 1);
    const empty = cells.filter((x) => !x.building);
    const noRoad = cells.filter((x) => !x.edge);
    const raw = dem.raw[zoneId] ?? 0;
    const eff = dem.values[zoneId] ?? 0;
    const pct = (v: number): number => Math.round(v * 100);
    if (!cells.length) {
      out.push({ sev: 'bad', icon: '🖌️', key: 'noCells', params: { zone: zname } });
      return out;
    }
    if (noRoad.length) out.push({ sev: 'warn', icon: '🚧', key: 'cellsNoRoad', params: { n: noRoad.length }, focus: { x: noRoad[0].x, z: noRoad[0].z } });
    if (!empty.length) out.push({ sev: 'info', icon: '🏘️', key: 'allBuilt', params: { n: cells.length } });
    else if (eff >= c.growth.minDemand) out.push({ sev: 'good', icon: '🌱', key: 'growing', params: { pct: pct(eff), n: empty.length } });

    if (eff < c.growth.minDemand) {
      out.push({ sev: 'info', icon: '📉', key: 'demandLow', params: { pct: pct(eff), raw: pct(raw), min: pct(c.growth.minDemand) } });
      const vac = dem.vacancy(zoneId) * c.demand.vacancyK;
      if (vac > 0.12) out.push({ sev: 'warn', icon: '🏚️', key: 'vacancy', params: { pct: pct(dem.vacancy(zoneId)) } });
      const tax = eco.taxes[zoneId] ?? c.demand.taxSlack;
      if (tax > c.demand.taxSlack + 1) out.push({ sev: 'warn', icon: '💸', key: 'taxHigh', params: { rate: tax, slack: c.demand.taxSlack } });
      if (zoneId === 'res') {
        if (st.jobsTotal <= st.workforce) out.push({ sev: 'warn', icon: '💼', key: 'noJobs', params: { jobs: Math.round(st.jobsTotal), wf: Math.round(st.workforce) } });
        if (st.happiness < 0.45) out.push({ sev: 'warn', icon: '😟', key: 'lowHappiness', params: { pct: pct(st.happiness) } });
      } else if (zoneId === 'com') {
        out.push({ sev: 'info', icon: '🛒', key: 'enoughShops', params: { pop: st.population, jobs: Math.round(st.jobsCom) } });
      } else if (zoneId === 'ind') {
        if (st.workforce - st.jobsTotal < 5) out.push({ sev: 'warn', icon: '👥', key: 'noIdleWorkers' });
        if (st.pollution > 0.25) out.push({ sev: 'warn', icon: '🏭', key: 'pollutionDemand', params: { pct: pct(st.pollution) } });
      }
    }
    if (zoneId === 'ind') {
      const sh = st.shortageByEdu[1];
      if (sh > c.education.shortageWarn && st.jobsByEdu[2] > 10) out.push({ sev: 'warn', icon: '🎓', key: 'needEducated', params: { pct: pct(sh) } });
    }
    out.push(...this._utilityIssues());
    const stuck = g.world.list().filter((b) => b.zone === zoneId && b.kind === 'zone' && !b.abandoned && (!b.powered || !b.watered || !b.access));
    if (stuck.length) out.push({ sev: 'warn', icon: '🔌', key: 'unserved', params: { n: stuck.length }, focus: { x: stuck[0].x, z: stuck[0].z } });
    const dead = g.world.list().filter((b) => b.zone === zoneId && b.abandoned);
    if (dead.length) out.push({ sev: 'bad', icon: '🏚️', key: 'abandoned', params: { n: dead.length }, focus: { x: dead[0].x, z: dead[0].z } });
    return sorted(out);
  }

  private _utilityIssues(): Issue[] {
    const u = this._game.get('utility');
    const out: Issue[] = [];
    if (u.powerDemand > u.powerSupply) out.push({ sev: 'bad', icon: '⚡', key: 'powerShort', params: { n: Math.round(u.powerDemand - u.powerSupply) } });
    if (u.waterDemand > u.waterSupply) out.push({ sev: 'bad', icon: '💧', key: 'waterShort', params: { n: Math.round(u.waterDemand - u.waterSupply) } });
    return out;
  }

  /** Почему бюджет в минусе (или что даёт плюс). */
  money(): Issue[] {
    const g = this._game;
    const eco = g.get('economy');
    const c = g.config;
    const st = g.get('stats');
    const b = eco.computeBudget();
    const out: Issue[] = [];
    const fmt = (v: number): number => Math.round(v);
    if (eco.money < 0) out.push({ sev: 'bad', icon: '💸', key: 'broke', params: { n: fmt(-eco.money) } });
    if (b.net < 0) {
      const months = eco.money > 0 ? Math.floor(eco.money / -b.net) : 0;
      out.push({ sev: b.net * 6 > -eco.money && eco.money < -b.net * 6 ? 'bad' : 'warn', icon: '📉', key: 'deficit', params: { n: fmt(-b.net), income: fmt(b.incomeTotal), expense: fmt(b.expenseTotal), months: months >= 60 ? '60+' : months } });
      const lines: [string, number][] = [['roads', b.expense.roads], ['services', b.expense.services], ['transit', b.expense.transit], ['policies', b.expense.policies], ['interest', b.expense.interest]];
      lines.sort((x, y) => y[1] - x[1]);
      const [name, v] = lines[0];
      if (v > 0) out.push({ sev: 'warn', icon: '🧾', key: 'topExpense', params: { name, pct: fmt((v / Math.max(1, b.expenseTotal)) * 100), n: fmt(v) } });
    } else out.push({ sev: 'good', icon: '📈', key: 'surplus', params: { n: fmt(b.net) } });

    // самые дорогие службы
    const byType = new Map<string, { n: number; cost: number }>();
    for (const x of g.world.list()) {
      if (x.kind !== 'service' || isBuilding(x)) continue;
      const d = effectiveDef(g.services.require(x.defId), x.up);
      const cur = byType.get(x.defId) ?? { n: 0, cost: 0 };
      cur.n++;
      cur.cost += d.upkeep * (eco.funding[d.fundingGroup] ?? 1);
      byType.set(x.defId, cur);
    }
    const top = [...byType.entries()].sort((x, y) => y[1].cost - x[1].cost).slice(0, 3);
    if (top.length && b.net < 0) out.push({ sev: 'info', icon: '🏛️', key: 'topServices', params: { list: top.map(([id, v]) => `${id}|${v.n}|${fmt(v.cost)}`).join(';') } });
    if (b.expense.interest > b.incomeTotal * 0.1 && b.expense.interest > 50) out.push({ sev: 'warn', icon: '🏦', key: 'interest', params: { n: fmt(b.expense.interest), debt: fmt(eco.debt) } });

    // почему доходов мало
    const taxLow = g.zoneTypes.all().filter((z) => (eco.taxes[z.id] ?? 0) < 6);
    for (const z of taxLow) out.push({ sev: 'info', icon: '🪙', key: 'lowTax', params: { zone: z.id, rate: eco.taxes[z.id] ?? 0 } });
    if (st.population > c.happiness.unemploymentPop && st.unemployment > 0.15) out.push({ sev: 'warn', icon: '💼', key: 'unemployment', params: { pct: Math.round(st.unemployment * 100) } });
    const list = g.world.list();
    const unpaid = list.filter((x) => x.kind === 'zone' && !isIdle(x) && (!x.powered || !x.watered));
    if (unpaid.length) out.push({ sev: 'warn', icon: '🔌', key: 'unpaid', params: { n: unpaid.length }, focus: { x: unpaid[0].x, z: unpaid[0].z } });
    const aband = list.filter((x) => x.abandoned);
    if (aband.length) out.push({ sev: 'warn', icon: '🏚️', key: 'abandonedTax', params: { n: aband.length }, focus: { x: aband[0].x, z: aband[0].z } });
    const building = list.filter((x) => isBuilding(x)).length;
    if (building > 5) out.push({ sev: 'info', icon: '🏗️', key: 'constructing', params: { n: building } });
    for (const grp of Object.keys(eco.funding)) {
      if ((eco.funding[grp] ?? 1) > 1.05) out.push({ sev: 'info', icon: '📋', key: 'overfunded', params: { group: grp, pct: Math.round((eco.funding[grp] ?? 1) * 100) } });
    }
    const fares = b.income.transit;
    if (b.expense.transit > 200 && fares < b.expense.transit * 0.25) out.push({ sev: 'info', icon: '🚌', key: 'transitLoss', params: { cost: fmt(b.expense.transit), fares: fmt(fares) } });
    if (eco.debt > 0 && b.net > 0 && eco.money > eco.debt * 0.5) out.push({ sev: 'info', icon: '🏦', key: 'repayHint', params: { debt: fmt(eco.debt) } });
    return sorted(out);
  }

  /** Что портит и что могло бы повысить настроение жителей (в среднем по городу). */
  happiness(): Issue[] {
    const g = this._game;
    const h = g.config.happiness;
    const growth = g.get('growth');
    const max: Record<string, number> = { police: h.police, fire: h.fire, health: h.health, park: h.park, education: h.education, transit: h.transit, power: h.powerOn, water: h.waterOn };
    const sum = new Map<string, number>();
    let pop = 0;
    for (const b of g.world.list()) {
      if (b.kind !== 'zone' || isIdle(b) || !g.zoneTypes.get(b.zone)?.housing || b.pop < 1) continue;
      pop += b.pop;
      for (const [k, v] of growth.happinessFactors(b)) sum.set(k, (sum.get(k) ?? 0) + v * b.pop);
    }
    if (!pop) return [{ sev: 'info', icon: '🏠', key: 'hapNoHomes' }];
    const rows: { key: string; avg: number; gap: number }[] = [];
    for (const [k, v] of sum) {
      if (k === 'base') continue;
      const avg = v / pop;
      const gap = k in max ? max[k] - avg : -avg;
      if (gap > 0.012) rows.push({ key: k, avg, gap });
    }
    rows.sort((a, b) => b.gap - a.gap);
    const out: Issue[] = rows.slice(0, 6).map((r) => ({ sev: r.gap > 0.07 ? 'bad' : r.gap > 0.035 ? 'warn' : 'info', icon: '😟', key: `hap.${r.key}`, params: { pct: Math.round(r.gap * 100) } }) as Issue);
    const hap = g.get('stats').happiness;
    out.unshift({ sev: hap < 0.4 ? 'bad' : hap < 0.6 ? 'warn' : 'good', icon: hap < 0.5 ? '😟' : '😊', key: 'hapTotal', params: { pct: Math.round(hap * 100) } });
    return out;
  }

  /** Слагаемые счастья здания, отсортированные по тому, что сильнее всего тянет вниз. */
  buildingFactors(b: Building): { key: string; value: number; gap: number }[] {
    const h = this._game.config.happiness;
    const max: Record<string, number> = { police: h.police, fire: h.fire, health: h.health, park: h.park, education: h.education, transit: h.transit, power: h.powerOn, water: h.waterOn };
    return this._game
      .get('growth')
      .happinessFactors(b)
      .filter(([k]) => k !== 'base')
      .map(([key, value]) => ({ key, value, gap: key in max ? max[key] - value : -value }))
      .filter((f) => f.gap > 0.012)
      .sort((a, c) => c.gap - a.gap);
  }

  /** Почему здание брошено или не работает в полную силу. null — всё в порядке. */
  buildingWhy(b: Building): string | null {
    if (b.kind !== 'zone') return null;
    if (b.abandoned) {
      if (!b.access) return 'why.noRoad';
      if (!b.powered) return 'why.noPower';
      if (!b.watered) return 'why.noWater';
      return 'why.unhappy';
    }
    if (!b.access) return 'why.noRoad';
    if (!b.powered) return 'why.noPower';
    if (!b.watered) return 'why.noWater';
    return null;
  }

  /** Подсказка для пустой размеченной клетки: ждёт спроса или чего-то не хватает. */
  cellWhy(cell: ZoneCell): string | null {
    const g = this._game;
    if (!cell.zone || cell.building) return null;
    if (!cell.edge) return 'cell.noRoad';
    const z = g.zoneTypes.at(cell.zone - 1);
    const d = g.get('demand').values[z.id] ?? 0;
    if (d < g.config.growth.minDemand) return 'cell.noDemand';
    return 'cell.waiting';
  }
}
