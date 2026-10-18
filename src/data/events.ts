/** Вариант решения в событии города. */
export interface CityEventOption {
  id: string;
  /** стоимость в зависимости от населения */
  cost?: (pop: number) => number;
  /** разовый доход */
  money?: (pop: number) => number;
  /** временный эффект: длительность в днях и изменения характеристик (см. ModifierSystem) */
  days?: number;
  mul?: Record<string, number>;
  add?: Record<string, number>;
}

export interface CityEventDef {
  id: string;
  icon: string;
  weight: number;
  minPop: number;
  /** содержимое, которое должно быть открыто (ключ ProgressSystem), иначе событие не наступает */
  needs?: string;
  /** последний вариант — «по умолчанию» (выбирается, если игрок не ответил) */
  options: CityEventOption[];
}

/**
 * События города. Тексты: `event.<id>.title|desc`, варианты `event.<id>.opt.<optId>`.
 * Чтобы добавить событие, достаточно дописать запись и переводы.
 */
export const CITY_EVENTS: CityEventDef[] = [
  {
    id: 'festival',
    icon: '🎉',
    weight: 3,
    minPop: 150,
    options: [
      { id: 'fund', cost: (p) => 600 + p * 0.8, days: 60, add: { happiness: 0.08 }, mul: { income: 1.08 } },
      { id: 'decline' },
    ],
  },
  {
    id: 'heatwave',
    icon: '🌡️',
    weight: 2,
    minPop: 200,
    options: [
      { id: 'campaign', cost: (p) => 400 + p * 0.5, days: 50, mul: { powerDemand: 1.1 } },
      { id: 'ignore', days: 50, mul: { powerDemand: 1.28 } },
    ],
  },
  {
    id: 'flu',
    icon: '🤧',
    weight: 2,
    minPop: 250,
    needs: 'service:clinic',
    options: [
      { id: 'vaccinate', cost: (p) => p * 3, days: 60, mul: { disease: 0.4 } },
      { id: 'ignore', days: 50, mul: { disease: 2.5, death: 2 }, add: { happiness: -0.04 } },
    ],
  },
  {
    id: 'grant',
    icon: '🏛️',
    weight: 2,
    minPop: 200,
    options: [
      { id: 'cash', money: (p) => 4000 + p * 2 },
      { id: 'rebate', days: 40, add: { happiness: 0.05 } },
    ],
  },
  {
    id: 'donation',
    icon: '💼',
    weight: 2,
    minPop: 300,
    options: [
      { id: 'accept', money: () => 6000, days: 90, add: { happiness: -0.03, demandInd: 0.1 } },
      { id: 'decline' },
    ],
  },
  {
    id: 'startup',
    icon: '💻',
    weight: 2,
    minPop: 500,
    options: [
      { id: 'taxbreak', days: 150, mul: { income: 0.96 }, add: { demandCom: 0.12 } },
      { id: 'decline' },
    ],
  },
  {
    id: 'crimewave',
    icon: '🥷',
    weight: 2,
    minPop: 350,
    needs: 'service:police',
    options: [
      { id: 'patrols', cost: (p) => 800 + p, days: 50, mul: { crime: 1.3 } },
      { id: 'ignore', days: 50, mul: { crime: 2.4 } },
    ],
  },
  {
    id: 'storm',
    icon: '⛈️',
    weight: 2,
    minPop: 200,
    needs: 'service:fire',
    options: [
      { id: 'prevent', cost: () => 500, days: 30, mul: { fire: 1.2 } },
      { id: 'ignore', days: 30, mul: { fire: 3 } },
    ],
  },
  {
    id: 'boom',
    icon: '📈',
    weight: 2,
    minPop: 600,
    options: [
      { id: 'invest', cost: () => 2000, days: 90, mul: { income: 1.15 } },
      { id: 'save', money: () => 1500 },
    ],
  },
  {
    id: 'recession',
    icon: '📉',
    weight: 1.5,
    minPop: 600,
    options: [
      { id: 'stimulus', cost: (p) => 1500 + p * 1.5 },
      { id: 'austerity', days: 60, mul: { income: 0.9 }, add: { happiness: -0.02 } },
    ],
  },
  {
    id: 'drought',
    icon: '🏜️',
    weight: 2,
    minPop: 300,
    options: [
      { id: 'restrict', cost: (p) => 300 + p * 0.4, days: 45, mul: { waterDemand: 1.05 } },
      { id: 'ignore', days: 45, mul: { waterDemand: 1.3 }, add: { happiness: -0.02 } },
    ],
  },
  {
    id: 'tourists',
    icon: '🧳',
    weight: 2,
    minPop: 400,
    needs: 'service:park',
    options: [
      { id: 'promote', cost: (p) => 800 + p * 0.6, days: 60, mul: { income: 1.06 }, add: { demandCom: 0.15 } },
      { id: 'quiet', days: 20, add: { demandCom: 0.04 } },
    ],
  },
  {
    id: 'strike',
    icon: '🪧',
    weight: 2,
    minPop: 500,
    options: [
      { id: 'negotiate', cost: (p) => 1000 + p * 1.2, days: 30, add: { happiness: 0.02 } },
      { id: 'wait', days: 45, mul: { income: 0.92 }, add: { happiness: -0.04, demandInd: -0.1 } },
    ],
  },
  {
    id: 'smog',
    icon: '🌫️',
    weight: 2,
    minPop: 600,
    options: [
      { id: 'ban', cost: (p) => 600 + p * 0.7, days: 30, mul: { disease: 1.2 }, add: { demandInd: -0.05 } },
      { id: 'endure', days: 30, mul: { disease: 1.8 }, add: { happiness: -0.03 } },
    ],
  },
  {
    id: 'sciencefair',
    icon: '🔬',
    weight: 2,
    minPop: 600,
    needs: 'service:highschool',
    options: [
      { id: 'sponsor', cost: (p) => 1200 + p * 0.8, days: 90, mul: { eduRate: 1.6 } },
      { id: 'skip' },
    ],
  },
  {
    id: 'marathon',
    icon: '🏃',
    weight: 2,
    minPop: 500,
    needs: 'service:sports',
    options: [
      { id: 'host', cost: (p) => 900 + p * 0.5, days: 40, add: { happiness: 0.07 }, mul: { income: 1.05 } },
      { id: 'decline' },
    ],
  },
  {
    id: 'fuelcrisis',
    icon: '⛽',
    weight: 1,
    minPop: 700,
    needs: 'service:coal',
    options: [
      { id: 'subsidy', cost: (p) => 1500 + p * 1.2, days: 40, mul: { powerDemand: 0.95 } },
      { id: 'pass', days: 40, mul: { powerDemand: 1.2, income: 0.97 } },
    ],
  },
  {
    id: 'techboom',
    icon: '💻',
    weight: 1,
    minPop: 1500,
    needs: 'density:3',
    options: [
      { id: 'incubator', cost: (p) => 3000 + p * 1.5, days: 120, mul: { income: 1.12 }, add: { demandInd: 0.1 } },
      { id: 'ignore' },
    ],
  },
];
