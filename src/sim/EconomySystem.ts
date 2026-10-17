import type { Game } from '../core/Game';
import type { System } from '../core/System';

declare module '../core/Game' {
  interface SystemMap {
    economy: EconomySystem;
  }
}

export interface Budget {
  income: { res: number; com: number; ind: number; transit: number };
  expense: { roads: number; services: number; transit: number; interest: number };
  incomeTotal: number;
  expenseTotal: number;
  net: number;
}

export const LOAN_STEP = 10000;

/** Деньги, налоги, финансирование служб, ежемесячный баланс и кредит. */
export class EconomySystem implements System {
  readonly id = 'economy';
  readonly order = 60;
  money = 50000;
  debt = 0;
  /** налоговые ставки по id зон, % */
  taxes: Record<string, number> = { res: 9, com: 9, ind: 9 };
  /** финансирование по группам служб: 0..1.5 */
  funding: Record<string, number> = { police: 1, fire: 1, health: 1, education: 1, parks: 1, utilities: 1 };
  history = { net: [] as number[], pop: [] as number[], money: [] as number[] };
  last: Budget | null = null;
  private _game!: Game;
  private _transitMonth = 0;

  init(game: Game): void {
    this._game = game;
    game.bus.on('time:month', () => this._closeMonth());
  }

  canAfford(cost: number): boolean {
    return this.money >= cost;
  }

  spend(cost: number): boolean {
    if (cost <= 0) return true;
    if (this.money < cost) {
      this._game.message('Недостаточно средств', 'bad');
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
    if (this.debt >= LOAN_STEP * 5) return this._game.message('Банк отказал: слишком большой долг', 'warn');
    this.debt += LOAN_STEP;
    this.money += LOAN_STEP;
    this._game.bus.emit('economy:changed');
  }

  repayLoan(): void {
    const amount = Math.min(LOAN_STEP, this.debt);
    if (amount <= 0 || this.money < amount) return;
    this.debt -= amount;
    this.money -= amount;
    this._game.bus.emit('economy:changed');
  }

  setTax(zone: string, rate: number): void {
    this.taxes[zone] = rate;
    this._game.bus.emit('economy:changed');
  }

  setFunding(group: string, v: number): void {
    this.funding[group] = v;
    this._game.bus.emit('economy:changed');
  }

  /** Расчёт месячного бюджета по текущему состоянию города. */
  computeBudget(): Budget {
    const g = this._game;
    const w = g.world;
    const maps = g.get('maps');
    const income = { res: 0, com: 0, ind: 0, transit: this._transitMonth };
    const expense = { roads: 0, services: 0, transit: 0, interest: this.debt * 0.01 };

    for (const b of w.list()) {
      if (b.kind === 'zone') {
        if (b.abandoned || !b.powered || !b.watered) continue;
        const z = g.zoneTypes.require(b.zone);
        const units = z.housing ? b.pop : b.workers;
        const rate = (this.taxes[z.id] ?? 9) / 100;
        let v = units * z.wage * rate * (0.5 + maps.landValue[b.cell]);
        if (z.id === 'com') v *= 0.6 + 0.4 * b.goods;
        income[z.id as 'res' | 'com' | 'ind'] += v;
      } else {
        const d = g.services.require(b.defId);
        expense.services += d.upkeep * (this.funding[d.fundingGroup] ?? 1);
      }
    }
    for (let i = 0; i < w.cells; i++) {
      if (w.road[i]) expense.roads += g.roadTypes.at(w.road[i] - 1).upkeep;
    }
    const transit = g.get('transit');
    expense.transit = transit.upkeep();

    const incomeTotal = income.res + income.com + income.ind + income.transit;
    const expenseTotal = expense.roads + expense.services + expense.transit + expense.interest;
    return { income, expense, incomeTotal, expenseTotal, net: incomeTotal - expenseTotal };
  }

  private _closeMonth(): void {
    const b = this.computeBudget();
    this.money += b.net;
    this.last = b;
    this._transitMonth = 0;
    const h = this.history;
    h.net.push(Math.round(b.net));
    h.pop.push(this._game.get('stats').population);
    h.money.push(Math.round(this.money));
    for (const arr of [h.net, h.pop, h.money]) if (arr.length > 36) arr.shift();
    if (this.money < 0) this._game.message('Бюджет в минусе! Поднимите налоги или возьмите кредит.', 'bad');
    this._game.bus.emit('economy:changed');
  }
}
