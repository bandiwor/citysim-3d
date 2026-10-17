import { effectiveDef } from '../data/services';
import type { Game } from '../core/Game';
import type { System } from '../core/System';
import { FUNDING_GROUPS } from '../data/services';

declare module '../core/Game' {
  interface SystemMap {
    economy: EconomySystem;
  }
}

export interface Budget {
  income: { res: number; com: number; ind: number; transit: number; export: number };
  expense: { roads: number; services: number; transit: number; interest: number; policies: number };
  incomeTotal: number;
  expenseTotal: number;
  net: number;
}

/** Деньги, налоги, финансирование служб, ежемесячный баланс и кредит. */
export class EconomySystem implements System {
  readonly id = 'economy';
  readonly order = 60;
  money = 0;
  debt = 0;
  /** налоговые ставки по id зон, % */
  taxes: Record<string, number> = {};
  /** финансирование по группам служб */
  funding: Record<string, number> = {};
  history = { net: [] as number[], pop: [] as number[], money: [] as number[] };
  last: Budget | null = null;
  private _game!: Game;
  private _transitMonth = 0;

  init(game: Game): void {
    this._game = game;
    const c = game.config.economy;
    if (this.money === 0) this.money = c.startMoney;
    for (const z of game.zoneTypes.all()) this.taxes[z.id] ??= c.defaultTax;
    for (const k of FUNDING_GROUPS) this.funding[k] ??= c.defaultFunding;
    game.bus.on('time:month', () => this._closeMonth());
  }

  canAfford(cost: number): boolean {
    return this.money >= cost;
  }

  spend(cost: number): boolean {
    if (cost <= 0) return true;
    if (this.money < cost) {
      this._game.sfx('error');
      return false;
    }
    this.money -= cost;
    this._game.bus.emit('economy:changed');
    return true;
  }

  earnTransit(v: number): void {
    this._transitMonth += v;
  }

  takeLoan(): void {
    const c = this._game.config.economy;
    if (this.debt >= c.loanStep * c.maxLoans) return this._game.message('msg.loanDenied', undefined, 'warn');
    this.debt += c.loanStep;
    this.money += c.loanStep;
    this._game.bus.emit('economy:changed');
  }

  repayLoan(): void {
    const step = this._game.config.economy.loanStep;
    const amount = Math.min(step, this.debt);
    if (amount <= 0 || this.money < amount) return;
    this.debt -= amount;
    this.money -= amount;
    this._game.bus.emit('economy:changed');
  }

  setTax(zone: string, rate: number): void {
    this.taxes[zone] = Math.min(this._game.config.economy.maxTax, Math.max(0, rate));
    this._game.bus.emit('economy:changed');
  }

  setFunding(group: string, v: number): void {
    this.funding[group] = Math.min(this._game.config.economy.maxFunding, Math.max(0, v));
    this._game.bus.emit('economy:changed');
  }

  /** Расчёт месячного бюджета по текущему состоянию города. */
  computeBudget(): Budget {
    const g = this._game;
    const c = g.config.economy;
    const maps = g.get('maps');
    const income = { res: 0, com: 0, ind: 0, transit: this._transitMonth, export: 0 };
    const expense = { roads: 0, services: 0, transit: 0, interest: this.debt * c.loanInterest, policies: g.get('policy').upkeep() };
    const incomeMul = g.get('mods').mul('income');
    let townhalls = 0;

    for (const b of g.world.list()) {
      if (b.kind === 'zone') {
        if (b.abandoned || !b.powered || !b.watered) continue;
        const z = g.zoneTypes.require(b.zone);
        const units = z.housing ? b.pop : b.workers;
        const rate = (this.taxes[z.id] ?? c.defaultTax) / 100;
        let v = units * z.wage * rate * (c.landTaxBase + maps.sample('landValue', b.x, b.z));
        if (z.id === 'com') v *= c.goodsBase + c.goodsK * b.goods;
        income[z.id as 'res' | 'com' | 'ind'] = (income[z.id as 'res' | 'com' | 'ind'] ?? 0) + v * incomeMul;
      } else {
        if (b.defId === 'townhall' && !b.abandoned) townhalls++;
        const d = effectiveDef(g.services.require(b.defId), b.up);
        expense.services += d.upkeep * (this.funding[d.fundingGroup] ?? 1);
      }
    }
    const unit = g.config.roads.costUnit;
    for (const e of g.world.graph.edges.values()) expense.roads += (e.len / unit) * g.roadTypes.at(e.type).upkeep;
    expense.transit = g.get('transit').upkeep();

    // мэрия повышает сборы (до +10%); излишки энергии и воды продаются соседям
    const civic = 1 + Math.min(0.1, townhalls * c.townhallBonus);
    income.res *= civic;
    income.com *= civic;
    income.ind *= civic;
    const u = g.get('utility');
    income.export = Math.max(0, u.powerSupply - u.powerDemand * 1.1) * c.powerExport + Math.max(0, u.waterSupply - u.waterDemand * 1.1) * c.waterExport;
    const incomeTotal = income.res + income.com + income.ind + income.transit + income.export;
    const expenseTotal = expense.roads + expense.services + expense.transit + expense.interest + expense.policies;
    return { income, expense, incomeTotal, expenseTotal, net: incomeTotal - expenseTotal };
  }

  /** Закрывает месяц: применяет баланс и пишет историю. */
  private _closeMonth(): void {
    const b = this.computeBudget();
    this.money += b.net;
    this.last = b;
    this._transitMonth = 0;
    const h = this.history;
    const limit = this._game.config.economy.historyLength;
    h.net.push(Math.round(b.net));
    h.pop.push(this._game.get('stats').population);
    h.money.push(Math.round(this.money));
    for (const arr of [h.net, h.pop, h.money]) while (arr.length > limit) arr.shift();
    if (this.money < 0) this._game.message('msg.budgetNegative', undefined, 'bad');
    this._game.bus.emit('economy:changed');
  }
}
