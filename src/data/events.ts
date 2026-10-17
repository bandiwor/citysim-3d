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
    options: [
      { id: 'vaccinate', cost: (p) => p * 3 },
      { id: 'ignore', days: 50, mul: { death: 4 }, add: { happiness: -0.04 } },
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
];
