import type { Game } from '../core/Game';
import type { System } from '../core/System';
import { fmtMoney, fmtNumber, fmtPercent, t } from '../i18n';

declare module '../core/Game' {
  interface SystemMap {
    objectives: ObjectiveSystem;
  }
}

export type ObjectiveKind = 'pop' | 'build' | 'happy' | 'profit' | 'jobs' | 'riders' | 'routes' | 'surplus' | 'level3' | 'money' | 'flow';

export interface Objective {
  id: number;
  kind: ObjectiveKind;
  /** id службы для kind = build */
  param: string;
  target: number;
  reward: number;
}

const POP_STEPS = [60, 120, 200, 350, 500, 800, 1200, 2000, 3000, 5000, 8000, 12000, 20000, 35000];

/**
 * Цели: всегда висит несколько заданий, подобранных под состояние города; за выполнение — деньги.
 * Цели не дают тупика: после выполнения тут же появляется следующая.
 */
export class ObjectiveSystem implements System {
  readonly id = 'objectives';
  readonly order = 85;
  active: Objective[] = [];
  completed = 0;
  private _game!: Game;
  private _acc = 0;
  private _fillAcc = 0;
  private _nextId = 1;

  init(game: Game): void {
    this._game = game;
  }

  // ---------- вычисление ----------

  /** Текущее значение показателя цели. */
  valueOf(o: Objective): number {
    const g = this._game;
    const st = g.get('stats');
    switch (o.kind) {
      case 'pop':
        return st.population;
      case 'build':
        return g.world.list().filter((b) => b.kind === 'service' && b.defId === o.param && !b.abandoned).length;
      case 'happy':
        return st.happiness;
      case 'profit':
        return (g.get('economy').last ?? g.get('economy').computeBudget()).net;
      case 'jobs':
        return st.population < 100 ? 0 : 1 - st.unemployment;
      case 'riders':
        return g.get('transit').ridersMonth;
      case 'routes':
        return g.get('transit').routes.filter((r) => r.status === 'ok').length;
      case 'surplus': {
        const u = g.get('utility');
        return u.powerDemand > 0 ? u.powerSupply / u.powerDemand : 0;
      }
      case 'level3':
        return g.world.list().filter((b) => b.kind === 'zone' && b.level >= 3 && !b.abandoned).length;
      case 'money':
        return g.get('economy').money;
      case 'flow':
        return g.get('traffic').vehicles.length >= 20 ? g.get('stats').trafficFlow : 0;
    }
  }

  fraction(o: Objective): number {
    return Math.max(0, Math.min(1, this.valueOf(o) / o.target));
  }

  isDone(o: Objective): boolean {
    return this.valueOf(o) >= o.target;
  }

  /** Текст цели и строка прогресса для интерфейса. */
  describe(o: Objective): { text: string; value: string; target: string } {
    const v = this.valueOf(o);
    switch (o.kind) {
      case 'pop':
        return { text: t('objective.pop', { n: fmtNumber(o.target) }), value: fmtNumber(v), target: fmtNumber(o.target) };
      case 'build':
        return { text: t('objective.build', { name: t(`service.${o.param}.name`) }), value: fmtNumber(v), target: fmtNumber(o.target) };
      case 'happy':
        return { text: t('objective.happy', { n: Math.round(o.target * 100) }), value: fmtPercent(v), target: fmtPercent(o.target) };
      case 'profit':
        return { text: t('objective.profit', { n: fmtMoney(o.target) }), value: fmtMoney(v), target: fmtMoney(o.target) };
      case 'jobs':
        return { text: t('objective.jobs', { n: Math.round(o.target * 100) }), value: fmtPercent(v), target: fmtPercent(o.target) };
      case 'riders':
        return { text: t('objective.riders', { n: fmtNumber(o.target) }), value: fmtNumber(v), target: fmtNumber(o.target) };
      case 'routes':
        return { text: t('objective.routes', { n: o.target }), value: fmtNumber(v), target: fmtNumber(o.target) };
      case 'surplus':
        return { text: t('objective.surplus', { n: Math.round((o.target - 1) * 100) }), value: fmtPercent(v), target: fmtPercent(o.target) };
      case 'level3':
        return { text: t('objective.level3', { n: o.target }), value: fmtNumber(v), target: fmtNumber(o.target) };
      case 'money':
        return { text: t('objective.money', { n: fmtMoney(o.target) }), value: fmtMoney(v), target: fmtMoney(o.target) };
      case 'flow':
        return { text: t('objective.flow', { n: Math.round(o.target * 100) }), value: fmtPercent(v), target: fmtPercent(o.target) };
    }
  }

  // ---------- генерация ----------

  /** Подбирает новую цель, подходящую текущему состоянию города (null — нечего предложить). */
  generate(): Objective | null {
    const g = this._game;
    const st = g.get('stats');
    const pop = st.population;
    const c = g.config.objectives;
    const taken = new Set(this.active.map((o) => `${o.kind}:${o.param}`));
    const out: Objective[] = [];
    const add = (kind: ObjectiveKind, param: string, target: number, reward: number): void => {
      if (taken.has(`${kind}:${param}`)) return;
      out.push({ id: 0, kind, param, target, reward: Math.round((reward * c.rewardMul) / 50) * 50 });
    };

    const nextPop = POP_STEPS.find((n) => n > pop * 1.05 + 5) ?? Math.ceil(pop * 1.5);
    add('pop', '', nextPop, nextPop * 5);
    add('pop', '', nextPop, nextPop * 5); // вес «население» выше

    for (const d of g.services.all()) {
      if (!g.get('progress').isUnlocked(`service:${d.id}`)) continue;
      if (d.id === 'townhall' && pop < 600) continue;
      const have = g.world.list().some((b) => b.kind === 'service' && b.defId === d.id);
      if (have) continue;
      // базовые службы предлагаем, когда город уже достаточно велик
      if (d.cost > 4000 && pop < 400) continue;
      add('build', d.id, 1, Math.max(400, d.cost * 0.6));
    }
    if (pop >= 100) {
      add('happy', '', Math.min(0.85, Math.ceil((st.happiness + 0.08) * 20) / 20), 1500 + pop);
      const net = (g.get('economy').last ?? g.get('economy').computeBudget()).net;
      add('profit', '', Math.max(200, Math.ceil((net + 400) / 100) * 100), 1200 + pop * 0.5);
      add('money', '', Math.max(5000, Math.ceil((g.get('economy').money * 1.5) / 1000) * 1000), 1500);
    }
    if (pop >= 150 && st.unemployment > 0.06) add('jobs', '', 0.95, 1800);
    if (pop >= 300) {
      const lv3 = g.world.list().filter((b) => b.kind === 'zone' && b.level >= 3).length;
      add('level3', '', lv3 + 3, 3000);
    }
    const u = g.get('utility');
    if (pop >= 100 && u.powerDemand > 0 && u.powerSupply < u.powerDemand * 1.2) add('surplus', '', 1.2, 900);
    if (pop >= 400 && g.get('traffic').vehicles.length >= 20) add('flow', '', 0.8, 1600);
    const tr = g.get('transit');
    if (g.get('progress').isUnlocked('tool:route') && g.get('fleet').facilities('bus').length) {
      add('routes', '', tr.routes.filter((r) => r.status === 'ok').length + 1, 1200);
      if (tr.routes.length) add('riders', '', Math.max(60, Math.ceil((tr.ridersMonth + 80) / 20) * 20), 1400);
    }
    const fresh = out.filter((o) => !this.isDone(o));
    if (!fresh.length) return null;
    const o = fresh[Math.floor(Math.random() * fresh.length)];
    o.id = this._nextId++;
    return o;
  }

  /** Доводит число активных целей до нормы. */
  fill(): void {
    const n = this._game.config.objectives.active;
    let guard = 12;
    while (this.active.length < n && guard-- > 0) {
      const o = this.generate();
      if (!o) break;
      this.active.push(o);
    }
    this._game.bus.emit('objectives:changed');
  }

  /** Заменить цель другой (кнопка «другая цель»). */
  reroll(id: number): void {
    const i = this.active.findIndex((o) => o.id === id);
    if (i < 0) return;
    const old = this.active.splice(i, 1)[0];
    const o = this.generate();
    this.active.splice(i, 0, o ?? old);
    this._game.bus.emit('objectives:changed');
  }

  update(_dt: number, realDt: number): void {
    this._acc += realDt;
    if (this._acc < 1) return;
    this._acc = 0;
    const g = this._game;
    if (g.get('stats').population < 1 && !this.active.length && g.world.buildings.size === 0) {
      // совсем новая игра: первая цель — первые жители
      this.fill();
      return;
    }
    let changed = false;
    for (const o of [...this.active]) {
      if (!this.isDone(o)) continue;
      this.active = this.active.filter((x) => x !== o);
      this.completed++;
      g.get('economy').money += o.reward;
      g.message('msg.objectiveDone', { text: this.describe(o).text, reward: fmtMoney(o.reward) }, 'good');
      g.sfx('levelup');
      g.bus.emit('economy:changed');
      changed = true;
    }
    this._fillAcc += 1;
    if (changed || (this.active.length < g.config.objectives.active && this._fillAcc >= 6)) {
      this._fillAcc = 0;
      this.fill();
    }
  }
}
