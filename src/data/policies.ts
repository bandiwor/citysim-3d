import type { Indexed } from '../core/Registry';

/** Городская политика: включается за ежемесячную плату и меняет правила игры через модификаторы. */
export interface PolicyDef extends Indexed {
  icon: string;
  /** плата в месяц */
  upkeep: number;
  /** население (пик), при котором политика открывается */
  unlock: number;
  /** множители (ключи `x.*`) и добавки к характеристикам города — см. ModifierSystem */
  mul?: Record<string, number>;
  add?: Record<string, number>;
}

export const POLICIES: PolicyDef[] = [
  { id: 'recycling', index: 0, icon: '♻️', upkeep: 160, unlock: 400, mul: { garbage: 0.6 } },
  { id: 'watch', index: 0, icon: '👮', upkeep: 140, unlock: 300, mul: { crime: 0.6 } },
  { id: 'smoke', index: 0, icon: '🔔', upkeep: 90, unlock: 200, mul: { fire: 0.45 } },
  { id: 'health', index: 0, icon: '💉', upkeep: 170, unlock: 500, mul: { death: 0.6, disease: 0.7 } },
  { id: 'energy', index: 0, icon: '💡', upkeep: 150, unlock: 700, mul: { powerDemand: 0.88 } },
  { id: 'freebus', index: 0, icon: '🚌', upkeep: 220, unlock: 500, mul: { fare: 0, transitShare: 1.6 } },
  { id: 'industry', index: 0, icon: '🏭', upkeep: 200, unlock: 600, add: { demandInd: 0.12, happiness: -0.01 } },
  { id: 'tourism', index: 0, icon: '🧳', upkeep: 260, unlock: 900, add: { demandCom: 0.12 } },
  { id: 'parks', index: 0, icon: '🌳', upkeep: 200, unlock: 1000, add: { happiness: 0.04 } },
];
