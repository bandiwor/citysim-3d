import type { Indexed } from '../core/Registry';

/** Группа финансирования службы (ползунок в бюджете). */
export const FUNDING_GROUPS = ['police', 'fire', 'health', 'education', 'parks', 'utilities', 'sanitation', 'transit'] as const;
export type FundingGroup = (typeof FUNDING_GROUPS)[number];

export interface ServiceDef extends Indexed {
  icon: string;
  /** категория на панели инструментов */
  category: string;
  size: [number, number];
  cost: number;
  upkeep: number;
  jobs: number;
  powerNeed: number;
  waterNeed: number;
  fundingGroup: FundingGroup;
  needsRoad: boolean;
  /** производит ресурсы */
  provides?: { power?: number; water?: number };
  /** покрытие: имя карты (police, fire, health, education, park…), радиус в клетках и сила */
  coverage?: { type: string; radius: number; strength: number };
  /** загрязнение вокруг, радиус в клетках */
  pollution?: { radius: number; strength: number };
  /** ключ процедурной модели в render/models.ts */
  model: string;
  /** парк машин, выезжающих из здания: полиция, мусоровозы, катафалки, автобусы (депо) */
  fleet?: { kind: 'police' | 'garbage' | 'hearse' | 'bus'; count: number };
  /** свалка / мусоросжигатель: ёмкость и скорость сжигания (ед/с) */
  waste?: { capacity: number; burn: number };
  /** кладбище / крематорий: ёмкость (мест) и скорость кремации (тел/с) */
  morgue?: { capacity: number; burn: number };
}

export const SERVICES: ServiceDef[] = [
  // Энергия
  { id: 'coal', index: 0, icon: '🏭', category: 'power', size: [3, 3], cost: 14000, upkeep: 380, jobs: 30, powerNeed: 0, waterNeed: 10, fundingGroup: 'utilities', needsRoad: true, provides: { power: 700 }, pollution: { radius: 10, strength: 1 }, model: 'coal' },
  { id: 'wind', index: 0, icon: '🌬️', category: 'power', size: [1, 1], cost: 2600, upkeep: 24, jobs: 1, powerNeed: 0, waterNeed: 0, fundingGroup: 'utilities', needsRoad: true, provides: { power: 70 }, model: 'wind' },
  { id: 'solar', index: 0, icon: '☀️', category: 'power', size: [2, 2], cost: 8500, upkeep: 60, jobs: 4, powerNeed: 0, waterNeed: 0, fundingGroup: 'utilities', needsRoad: true, provides: { power: 220 }, model: 'solar' },
  // Вода
  { id: 'watertower', index: 0, icon: '🚰', category: 'power', size: [1, 1], cost: 1800, upkeep: 40, jobs: 2, powerNeed: 8, waterNeed: 0, fundingGroup: 'utilities', needsRoad: true, provides: { water: 450 }, model: 'watertower' },
  { id: 'waterplant', index: 0, icon: '💧', category: 'power', size: [2, 2], cost: 6000, upkeep: 110, jobs: 8, powerNeed: 30, waterNeed: 0, fundingGroup: 'utilities', needsRoad: true, provides: { water: 1800 }, model: 'waterplant' },
  // Безопасность
  { id: 'police', index: 0, icon: '🚓', category: 'safety', size: [1, 1], cost: 2200, upkeep: 100, jobs: 8, powerNeed: 10, waterNeed: 2, fundingGroup: 'police', needsRoad: true, coverage: { type: 'police', radius: 11, strength: 1 }, model: 'police', fleet: { kind: 'police', count: 2 } },
  { id: 'fire', index: 0, icon: '🚒', category: 'safety', size: [1, 1], cost: 2000, upkeep: 90, jobs: 8, powerNeed: 10, waterNeed: 4, fundingGroup: 'fire', needsRoad: true, coverage: { type: 'fire', radius: 12, strength: 1 }, model: 'fire' },
  // Здоровье
  { id: 'clinic', index: 0, icon: '🩺', category: 'health', size: [1, 1], cost: 2600, upkeep: 120, jobs: 10, powerNeed: 12, waterNeed: 4, fundingGroup: 'health', needsRoad: true, coverage: { type: 'health', radius: 10, strength: 0.8 }, model: 'clinic' },
  { id: 'hospital', index: 0, icon: '🏥', category: 'health', size: [2, 2], cost: 8000, upkeep: 320, jobs: 40, powerNeed: 40, waterNeed: 15, fundingGroup: 'health', needsRoad: true, coverage: { type: 'health', radius: 18, strength: 1 }, model: 'hospital' },
  // Образование
  { id: 'school', index: 0, icon: '🏫', category: 'education', size: [2, 2], cost: 3600, upkeep: 160, jobs: 14, powerNeed: 16, waterNeed: 6, fundingGroup: 'education', needsRoad: true, coverage: { type: 'education', radius: 12, strength: 0.7 }, model: 'school' },
  { id: 'university', index: 0, icon: '🎓', category: 'education', size: [3, 3], cost: 12000, upkeep: 520, jobs: 50, powerNeed: 60, waterNeed: 20, fundingGroup: 'education', needsRoad: true, coverage: { type: 'education', radius: 22, strength: 1 }, model: 'university' },
  // Парки
  { id: 'park', index: 0, icon: '🌳', category: 'parks', size: [1, 1], cost: 350, upkeep: 6, jobs: 0, powerNeed: 0, waterNeed: 0, fundingGroup: 'parks', needsRoad: false, coverage: { type: 'park', radius: 6, strength: 0.9 }, model: 'park' },
  { id: 'bigpark', index: 0, icon: '⛲', category: 'parks', size: [2, 2], cost: 1500, upkeep: 24, jobs: 1, powerNeed: 0, waterNeed: 0, fundingGroup: 'parks', needsRoad: false, coverage: { type: 'park', radius: 11, strength: 1 }, model: 'bigpark' },
  // Мусор и погребение
  { id: 'landfill', index: 0, icon: '🗑️', category: 'garbage', size: [3, 3], cost: 3500, upkeep: 70, jobs: 6, powerNeed: 0, waterNeed: 0, fundingGroup: 'sanitation', needsRoad: true, pollution: { radius: 9, strength: 0.8 }, waste: { capacity: 4000, burn: 0 }, fleet: { kind: 'garbage', count: 2 }, model: 'landfill' },
  { id: 'incinerator', index: 0, icon: '♨️', category: 'garbage', size: [2, 2], cost: 14000, upkeep: 320, jobs: 25, powerNeed: 12, waterNeed: 8, fundingGroup: 'sanitation', needsRoad: true, provides: { power: 160 }, pollution: { radius: 6, strength: 0.55 }, waste: { capacity: 500, burn: 6 }, fleet: { kind: 'garbage', count: 3 }, model: 'incinerator' },
  { id: 'cemetery', index: 0, icon: '🪦', category: 'garbage', size: [3, 3], cost: 4500, upkeep: 50, jobs: 4, powerNeed: 0, waterNeed: 0, fundingGroup: 'sanitation', needsRoad: true, morgue: { capacity: 1000, burn: 0 }, fleet: { kind: 'hearse', count: 2 }, model: 'cemetery' },
  { id: 'crematorium', index: 0, icon: '⚱️', category: 'garbage', size: [2, 2], cost: 7000, upkeep: 140, jobs: 8, powerNeed: 14, waterNeed: 4, fundingGroup: 'sanitation', needsRoad: true, pollution: { radius: 5, strength: 0.35 }, morgue: { capacity: 60, burn: 0.4 }, fleet: { kind: 'hearse', count: 2 }, model: 'crematorium' },
  // Общественный транспорт
  { id: 'busdepot', index: 0, icon: '🚌', category: 'transit', size: [2, 2], cost: 7000, upkeep: 160, jobs: 10, powerNeed: 14, waterNeed: 3, fundingGroup: 'transit', needsRoad: true, fleet: { kind: 'bus', count: 8 }, model: 'busdepot' },
];
