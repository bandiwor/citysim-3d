/** Читы: включаются на стартовом экране, сохраняются вместе с игрой. Чтобы добавить чит — дописать поле, запись в CHEAT_DEFS и перевод `cheat.<id>`. */
export interface Cheats {
  /** деньги не кончаются */
  infiniteMoney: boolean;
  /** здания и улучшения строятся мгновенно */
  instantBuild: boolean;
  /** без пожаров и бедствий */
  noDisasters: boolean;
  /** всё содержимое открыто с самого начала (в карьере) */
  unlockAll: boolean;
  /** службы и дороги ничего не стоят в содержании */
  noUpkeep: boolean;
  /** любые здания всегда с энергией и водой */
  freeUtilities: boolean;
  /** максимальный спрос на всех зонах */
  maxDemand: boolean;
  /** жители всегда счастливы */
  happyCity: boolean;
  /** стартовые деньги, 0 — по умолчанию */
  startMoney: number;
}

export const CHEATS_OFF: Cheats = {
  infiniteMoney: false,
  instantBuild: false,
  noDisasters: false,
  unlockAll: false,
  noUpkeep: false,
  freeUtilities: false,
  maxDemand: false,
  happyCity: false,
  startMoney: 0,
};

export type CheatDef = { id: keyof Cheats; icon: string } & ({ kind: 'toggle' } | { kind: 'choice'; choices: number[] });

/** Список читов для стартового экрана (порядок = порядок на экране). */
export const CHEAT_DEFS: CheatDef[] = [
  { id: 'infiniteMoney', icon: '💰', kind: 'toggle' },
  { id: 'startMoney', icon: '🏦', kind: 'choice', choices: [0, 250_000, 1_000_000, 10_000_000] },
  { id: 'instantBuild', icon: '⚡', kind: 'toggle' },
  { id: 'unlockAll', icon: '🔓', kind: 'toggle' },
  { id: 'noUpkeep', icon: '🧾', kind: 'toggle' },
  { id: 'freeUtilities', icon: '🔌', kind: 'toggle' },
  { id: 'maxDemand', icon: '📈', kind: 'toggle' },
  { id: 'happyCity', icon: '😊', kind: 'toggle' },
  { id: 'noDisasters', icon: '🛡️', kind: 'toggle' },
];

export const anyCheat = (c: Cheats): boolean => Object.entries(c).some(([k, v]) => (k === 'startMoney' ? v > 0 : v === true));
