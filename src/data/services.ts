import type { Indexed } from '../core/Registry';

/** Группа финансирования службы (ползунок в бюджете). */
export const FUNDING_GROUPS = ['police', 'fire', 'health', 'education', 'parks', 'utilities', 'sanitation', 'transit'] as const;
export type FundingGroup = (typeof FUNDING_GROUPS)[number];

/** Улучшение здания-службы: покупается один раз, меняет внешний вид и характеристики. */
export interface UpgradeDef {
  /** уникален в пределах службы; перевод — `upgrade.<служба>.<id>.name|desc` */
  id: string;
  icon: string;
  cost: number;
  /** добавка к содержанию в месяц */
  upkeep: number;
  /** множители (×) и добавки (+) к характеристикам */
  fx: {
    /** × производство электричества / воды */
    power?: number;
    water?: number;
    /** × радиус и сила покрытия */
    radius?: number;
    strength?: number;
    /** × загрязнение */
    pollution?: number;
    /** × ёмкость хранилища, × скорость сжигания */
    capacity?: number;
    burn?: number;
    /** + машин в парке, + рабочих мест */
    fleet?: number;
    jobs?: number;
  };
}

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
  fleet?: { kind: 'police' | 'garbage' | 'hearse' | 'bus' | 'taxi'; count: number };
  /** свалка / мусоросжигатель: ёмкость и скорость сжигания (ед/с) */
  waste?: { capacity: number; burn: number };
  /** кладбище / крематорий: ёмкость (мест) и скорость кремации (тел/с) */
  morgue?: { capacity: number; burn: number };
  /** звук здания, слышимый рядом (ветряк, механизмы, фонтан, чайки, дети) */
  sound?: 'turbine' | 'machinery' | 'gulls' | 'fountain' | 'kids';
  /** доступные улучшения (максимум 30) */
  upgrades?: UpgradeDef[];
}

export const SERVICES: ServiceDef[] = [
  // Энергия
  { id: 'coal', index: 0, icon: '🏭', category: 'power', size: [3, 3], cost: 14000, upkeep: 380, jobs: 30, powerNeed: 0, waterNeed: 10, fundingGroup: 'utilities', needsRoad: true, provides: { power: 700 }, pollution: { radius: 10, strength: 1 }, model: 'coal' },
  { id: 'wind', index: 0, icon: '🌬️', category: 'power', size: [1, 1], cost: 2600, upkeep: 24, jobs: 1, powerNeed: 0, waterNeed: 0, fundingGroup: 'utilities', needsRoad: true, provides: { power: 70 }, model: 'wind' },
  { id: 'solar', index: 0, icon: '☀️', category: 'power', size: [2, 2], cost: 8500, upkeep: 60, jobs: 4, powerNeed: 0, waterNeed: 0, fundingGroup: 'utilities', needsRoad: true, provides: { power: 220 }, model: 'solar' },
  // Вода
  { id: 'watertower', index: 0, icon: '🚰', category: 'water', size: [1, 1], cost: 1800, upkeep: 40, jobs: 2, powerNeed: 8, waterNeed: 0, fundingGroup: 'utilities', needsRoad: true, provides: { water: 450 }, model: 'watertower' },
  { id: 'waterplant', index: 0, icon: '💧', category: 'water', size: [2, 2], cost: 6000, upkeep: 110, jobs: 8, powerNeed: 30, waterNeed: 0, fundingGroup: 'utilities', needsRoad: true, provides: { water: 1800 }, model: 'waterplant' },
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
  { id: 'landfill', index: 0, icon: '🗑️', category: 'garbage', size: [3, 3], cost: 3500, upkeep: 70, jobs: 6, powerNeed: 0, waterNeed: 0, fundingGroup: 'sanitation', needsRoad: true, pollution: { radius: 9, strength: 0.8 }, waste: { capacity: 4000, burn: 0 }, fleet: { kind: 'garbage', count: 3 }, model: 'landfill' },
  { id: 'incinerator', index: 0, icon: '♨️', category: 'garbage', size: [2, 2], cost: 14000, upkeep: 320, jobs: 25, powerNeed: 12, waterNeed: 8, fundingGroup: 'sanitation', needsRoad: true, provides: { power: 160 }, pollution: { radius: 6, strength: 0.55 }, waste: { capacity: 600, burn: 8 }, fleet: { kind: 'garbage', count: 4 }, model: 'incinerator' },
  { id: 'cemetery', index: 0, icon: '🪦', category: 'garbage', size: [3, 3], cost: 4500, upkeep: 50, jobs: 4, powerNeed: 0, waterNeed: 0, fundingGroup: 'sanitation', needsRoad: true, morgue: { capacity: 1000, burn: 0 }, fleet: { kind: 'hearse', count: 2 }, model: 'cemetery' },
  { id: 'crematorium', index: 0, icon: '⚱️', category: 'garbage', size: [2, 2], cost: 7000, upkeep: 140, jobs: 8, powerNeed: 14, waterNeed: 4, fundingGroup: 'sanitation', needsRoad: true, pollution: { radius: 5, strength: 0.35 }, morgue: { capacity: 60, burn: 0.4 }, fleet: { kind: 'hearse', count: 2 }, model: 'crematorium' },
  { id: 'gas', index: 0, icon: '🔥', category: 'power', size: [2, 2], cost: 9000, upkeep: 220, jobs: 18, powerNeed: 0, waterNeed: 6, fundingGroup: 'utilities', needsRoad: true, provides: { power: 380 }, pollution: { radius: 6, strength: 0.45 }, model: 'gas' },
  { id: 'pumpstation', index: 0, icon: '⛽', category: 'water', size: [1, 1], cost: 3200, upkeep: 70, jobs: 4, powerNeed: 16, waterNeed: 0, fundingGroup: 'utilities', needsRoad: true, provides: { water: 950 }, model: 'pumpstation' },
  { id: 'policehq', index: 0, icon: '🏛️', category: 'safety', size: [2, 2], cost: 9000, upkeep: 380, jobs: 30, powerNeed: 30, waterNeed: 6, fundingGroup: 'police', needsRoad: true, coverage: { type: 'police', radius: 22, strength: 1 }, fleet: { kind: 'police', count: 5 }, model: 'policehq' },
  { id: 'firehq', index: 0, icon: '🚨', category: 'safety', size: [2, 2], cost: 8000, upkeep: 340, jobs: 28, powerNeed: 28, waterNeed: 10, fundingGroup: 'fire', needsRoad: true, coverage: { type: 'fire', radius: 24, strength: 1 }, model: 'firehq' },
  { id: 'library', index: 0, icon: '📚', category: 'education', size: [2, 2], cost: 4200, upkeep: 140, jobs: 10, powerNeed: 10, waterNeed: 3, fundingGroup: 'education', needsRoad: true, coverage: { type: 'education', radius: 14, strength: 0.5 }, model: 'library' },
  { id: 'plaza', index: 0, icon: '⛲', category: 'parks', size: [1, 1], cost: 700, upkeep: 10, jobs: 0, powerNeed: 0, waterNeed: 0, fundingGroup: 'parks', needsRoad: false, coverage: { type: 'park', radius: 8, strength: 1 }, model: 'plaza' },
  { id: 'stadium', index: 0, icon: '🏟️', category: 'parks', size: [3, 3], cost: 16000, upkeep: 420, jobs: 20, powerNeed: 60, waterNeed: 10, fundingGroup: 'parks', needsRoad: true, coverage: { type: 'park', radius: 18, strength: 1 }, model: 'stadium' },
  { id: 'recycling', index: 0, icon: '♻️', category: 'garbage', size: [2, 2], cost: 6500, upkeep: 180, jobs: 14, powerNeed: 18, waterNeed: 4, fundingGroup: 'sanitation', needsRoad: true, waste: { capacity: 350, burn: 3 }, fleet: { kind: 'garbage', count: 2 }, model: 'recycling' },
  // Больше разнообразия: энергия, вода, безопасность, здоровье, образование, парки
  { id: 'nuclear', index: 0, icon: '☢️', category: 'power', size: [3, 3], cost: 60000, upkeep: 1500, jobs: 80, powerNeed: 0, waterNeed: 40, fundingGroup: 'utilities', needsRoad: true, provides: { power: 2400 }, model: 'nuclear' },
  { id: 'geothermal', index: 0, icon: '🌋', category: 'power', size: [2, 2], cost: 26000, upkeep: 300, jobs: 14, powerNeed: 0, waterNeed: 4, fundingGroup: 'utilities', needsRoad: true, provides: { power: 340 }, model: 'geothermal' },
  { id: 'windfarm', index: 0, icon: '🌬️', category: 'power', size: [3, 3], cost: 15000, upkeep: 140, jobs: 6, powerNeed: 0, waterNeed: 0, fundingGroup: 'utilities', needsRoad: true, provides: { power: 520 }, model: 'windfarm' },
  { id: 'well', index: 0, icon: '🪣', category: 'water', size: [1, 1], cost: 900, upkeep: 18, jobs: 1, powerNeed: 4, waterNeed: 0, fundingGroup: 'utilities', needsRoad: true, provides: { water: 260 }, model: 'well' },
  { id: 'desalination', index: 0, icon: '🌊', category: 'water', size: [3, 3], cost: 22000, upkeep: 380, jobs: 20, powerNeed: 70, waterNeed: 0, fundingGroup: 'utilities', needsRoad: true, provides: { water: 3400 }, model: 'desalination' },
  { id: 'policepost', index: 0, icon: '👮', category: 'safety', size: [1, 1], cost: 900, upkeep: 40, jobs: 3, powerNeed: 5, waterNeed: 1, fundingGroup: 'police', needsRoad: true, coverage: { type: 'police', radius: 6, strength: 0.7 }, model: 'policepost' },
  { id: 'firepost', index: 0, icon: '🧯', category: 'safety', size: [1, 1], cost: 1000, upkeep: 45, jobs: 4, powerNeed: 5, waterNeed: 2, fundingGroup: 'fire', needsRoad: true, coverage: { type: 'fire', radius: 8, strength: 0.8 }, model: 'firepost' },
  { id: 'firehelidepot', index: 0, icon: '🚁', category: 'safety', size: [2, 2], cost: 14000, upkeep: 300, jobs: 20, powerNeed: 30, waterNeed: 8, fundingGroup: 'fire', needsRoad: true, coverage: { type: 'fire', radius: 30, strength: 1 }, model: 'firehelidepot' },
  { id: 'pharmacy', index: 0, icon: '💊', category: 'health', size: [1, 1], cost: 1400, upkeep: 50, jobs: 4, powerNeed: 6, waterNeed: 1, fundingGroup: 'health', needsRoad: true, coverage: { type: 'health', radius: 6, strength: 0.5 }, model: 'pharmacy' },
  { id: 'medcenter', index: 0, icon: '🩻', category: 'health', size: [2, 2], cost: 5200, upkeep: 200, jobs: 22, powerNeed: 22, waterNeed: 6, fundingGroup: 'health', needsRoad: true, coverage: { type: 'health', radius: 13, strength: 0.9 }, model: 'medcenter' },
  { id: 'kindergarten', index: 0, icon: '🧸', category: 'education', size: [1, 1], cost: 1800, upkeep: 70, jobs: 6, powerNeed: 6, waterNeed: 2, fundingGroup: 'education', needsRoad: true, coverage: { type: 'education', radius: 7, strength: 0.4 }, model: 'kindergarten' },
  { id: 'highschool', index: 0, icon: '🏫', category: 'education', size: [2, 2], cost: 6000, upkeep: 240, jobs: 24, powerNeed: 22, waterNeed: 8, fundingGroup: 'education', needsRoad: true, coverage: { type: 'education', radius: 16, strength: 0.85 }, model: 'highschool' },
  { id: 'college', index: 0, icon: '🎒', category: 'education', size: [2, 2], cost: 9000, upkeep: 360, jobs: 30, powerNeed: 30, waterNeed: 10, fundingGroup: 'education', needsRoad: true, coverage: { type: 'education', radius: 20, strength: 0.95 }, model: 'college' },
  { id: 'garden', index: 0, icon: '🌺', category: 'parks', size: [3, 3], cost: 4200, upkeep: 40, jobs: 3, powerNeed: 0, waterNeed: 0, fundingGroup: 'parks', needsRoad: false, coverage: { type: 'park', radius: 16, strength: 0.95 }, model: 'garden' },
  { id: 'sports', index: 0, icon: '🏀', category: 'parks', size: [2, 2], cost: 5400, upkeep: 90, jobs: 8, powerNeed: 12, waterNeed: 2, fundingGroup: 'parks', needsRoad: true, coverage: { type: 'park', radius: 13, strength: 0.9 }, model: 'sports' },
  // Городские символы
  { id: 'townhall', index: 0, icon: '🏛️', category: 'landmarks', size: [2, 2], cost: 12000, upkeep: 220, jobs: 25, powerNeed: 20, waterNeed: 6, fundingGroup: 'utilities', needsRoad: true, model: 'townhall' },
  { id: 'monument', index: 0, icon: '🗽', category: 'landmarks', size: [2, 2], cost: 30000, upkeep: 120, jobs: 6, powerNeed: 0, waterNeed: 0, fundingGroup: 'parks', needsRoad: false, coverage: { type: 'park', radius: 28, strength: 1 }, model: 'monument' },
  // Общественный транспорт
  { id: 'clocktower', index: 0, icon: '🕰️', category: 'landmarks', size: [1, 1], cost: 5000, upkeep: 15, jobs: 1, powerNeed: 0, waterNeed: 0, fundingGroup: 'parks', needsRoad: false, coverage: { type: 'park', radius: 12, strength: 0.9 }, model: 'clocktower' },
  { id: 'obelisk', index: 0, icon: '🔺', category: 'landmarks', size: [1, 1], cost: 4200, upkeep: 10, jobs: 0, powerNeed: 0, waterNeed: 0, fundingGroup: 'parks', needsRoad: false, coverage: { type: 'park', radius: 10, strength: 0.85 }, model: 'obelisk' },
  { id: 'arch', index: 0, icon: '🏛️', category: 'landmarks', size: [2, 2], cost: 11000, upkeep: 40, jobs: 2, powerNeed: 0, waterNeed: 0, fundingGroup: 'parks', needsRoad: false, coverage: { type: 'park', radius: 16, strength: 0.95 }, model: 'arch' },
  { id: 'tvtower', index: 0, icon: '📡', category: 'landmarks', size: [2, 2], cost: 26000, upkeep: 160, jobs: 12, powerNeed: 25, waterNeed: 2, fundingGroup: 'parks', needsRoad: true, coverage: { type: 'park', radius: 22, strength: 0.9 }, model: 'tvtower' },
  { id: 'cathedral', index: 0, icon: '⛪', category: 'landmarks', size: [3, 3], cost: 22000, upkeep: 90, jobs: 8, powerNeed: 8, waterNeed: 2, fundingGroup: 'parks', needsRoad: true, coverage: { type: 'park', radius: 22, strength: 1 }, model: 'cathedral' },
  { id: 'opera', index: 0, icon: '🎭', category: 'landmarks', size: [3, 3], cost: 28000, upkeep: 180, jobs: 30, powerNeed: 30, waterNeed: 6, fundingGroup: 'parks', needsRoad: true, coverage: { type: 'park', radius: 24, strength: 1 }, model: 'opera' },
  { id: 'ferriswheel', index: 0, icon: '🎡', category: 'landmarks', size: [3, 3], cost: 18000, upkeep: 130, jobs: 12, powerNeed: 20, waterNeed: 2, fundingGroup: 'parks', needsRoad: true, coverage: { type: 'park', radius: 22, strength: 0.95 }, model: 'ferriswheel' },
  { id: 'taxidepot', index: 0, icon: '🚕', category: 'transit', size: [2, 2], cost: 4500, upkeep: 110, jobs: 8, powerNeed: 8, waterNeed: 2, fundingGroup: 'transit', needsRoad: true, fleet: { kind: 'taxi', count: 6 }, model: 'taxidepot' },
  { id: 'busdepot', index: 0, icon: '🚌', category: 'transit', size: [2, 2], cost: 7000, upkeep: 160, jobs: 10, powerNeed: 14, waterNeed: 3, fundingGroup: 'transit', needsRoad: true, fleet: { kind: 'bus', count: 8 }, model: 'busdepot' },
];

const up = (id: string, icon: string, cost: number, upkeep: number, fx: UpgradeDef['fx']): UpgradeDef => ({ id, icon, cost, upkeep, fx });

/** Улучшения по службам (подключаются к определениям при загрузке модуля). */
const UPGRADES: Record<string, UpgradeDef[]> = {
  coal: [up('scrubbers', '🧪', 6000, 40, { pollution: 0.45 }), up('turbines', '⚙️', 9000, 60, { power: 1.5 }), up('capture', '🌫️', 14000, 90, { pollution: 0.6, power: 1.15 })],
  gas: [up('turbine', '⚙️', 7000, 50, { power: 1.4 }), up('recovery', '♨️', 9000, 70, { power: 1.2, pollution: 0.6 })],
  wind: [up('rotor', '🌀', 1800, 8, { power: 1.6 }), up('tower', '🗼', 3200, 12, { power: 1.4 })],
  solar: [up('tracker', '🧭', 5000, 20, { power: 1.4 }), up('cells', '🔋', 7000, 25, { power: 1.3 })],
  watertower: [up('pump', '🔧', 1500, 10, { water: 1.6 })],
  pumpstation: [up('pump', '🔧', 2500, 18, { water: 1.5 }), up('filter', '🧫', 3500, 22, { water: 1.3, jobs: 2 })],
  waterplant: [up('filter', '🧫', 4000, 30, { water: 1.5 }), up('reservoir', '🌊', 6000, 45, { water: 1.4 })],
  police: [up('cars', '🚓', 1800, 25, { fleet: 2 }), up('station', '🏢', 3500, 40, { radius: 1.35, strength: 1.1, jobs: 4 })],
  policehq: [up('swat', '🛡️', 6000, 90, { fleet: 3, strength: 1.1 }), up('lab', '🔬', 7000, 100, { radius: 1.25 })],
  fire: [up('ladder', '🪜', 2500, 30, { radius: 1.3 }), up('tank', '💧', 3000, 35, { strength: 1.2, jobs: 3 })],
  firehq: [up('copter', '🚁', 7000, 90, { radius: 1.3 }), up('academy', '🎓', 6000, 70, { strength: 1.2 })],
  clinic: [up('lab', '🧪', 2000, 25, { strength: 1.3 }), up('ward', '🛏️', 3000, 40, { radius: 1.25, jobs: 4 })],
  hospital: [up('wing', '🏥', 5000, 80, { radius: 1.3, jobs: 15 }), up('icu', '💉', 7000, 110, { strength: 1.2 }), up('helipad', '🚁', 9000, 90, { radius: 1.2 })],
  school: [up('labs', '🔬', 2600, 30, { strength: 1.3 }), up('sports', '🏀', 2000, 20, { radius: 1.2, jobs: 2 })],
  library: [up('digital', '💻', 2500, 30, { strength: 1.4 })],
  university: [up('research', '🧬', 9000, 120, { radius: 1.3, jobs: 20 }), up('campus', '🏛️', 12000, 150, { strength: 1.2, radius: 1.15 })],
  park: [up('playground', '🛝', 400, 4, { strength: 1.25 })],
  plaza: [up('fountain', '⛲', 500, 5, { strength: 1.25, radius: 1.2 })],
  bigpark: [up('pavilion', '🎪', 1200, 10, { radius: 1.3 }), up('lake', '🦆', 1800, 14, { strength: 1.2 })],
  stadium: [up('lights', '💡', 5000, 60, { strength: 1.2 }), up('roof', '🏟️', 9000, 90, { radius: 1.3, jobs: 15 })],
  landfill: [up('compaction', '🚜', 3000, 30, { capacity: 1.8, fleet: 1 }), up('gas', '♨️', 3500, 25, { pollution: 0.7 })],
  incinerator: [up('filters', '🌫️', 5000, 60, { pollution: 0.4 }), up('boiler', '🔥', 4000, 50, { burn: 1.6, power: 1.3, fleet: 2 })],
  recycling: [up('sorting', '🗂️', 4500, 50, { burn: 1.8 }), up('hall', '🏭', 6000, 60, { capacity: 1.8 })],
  cemetery: [up('expansion', '🪦', 2500, 20, { capacity: 2 })],
  crematorium: [up('furnace', '🔥', 3500, 40, { burn: 1.8 }), up('filter', '🌫️', 3000, 30, { pollution: 0.4 })],
  monument: [up('garden', '🌷', 3000, 20, { radius: 1.2, strength: 1.1 })],
  nuclear: [up('cooling', '❄️', 14000, 120, { power: 1.15 }), up('containment', '🛡️', 20000, 160, { power: 1.1, jobs: 20 })],
  geothermal: [up('deep', '⛏️', 9000, 70, { power: 1.4 })],
  windfarm: [up('rotors', '🌀', 6000, 40, { power: 1.35 })],
  desalination: [up('membranes', '🧫', 9000, 90, { water: 1.4 })],
  medcenter: [up('diagnostics', '🩻', 5000, 70, { strength: 1.2, radius: 1.15 })],
  highschool: [up('labs', '🔬', 4000, 60, { strength: 1.2, jobs: 6 })],
  college: [up('research', '🧬', 7000, 90, { radius: 1.25, strength: 1.1 })],
  garden: [up('greenhouse', '🪴', 3000, 20, { radius: 1.25 })],
  sports: [up('stands', '🏟️', 4000, 50, { strength: 1.15, radius: 1.2 })],
  taxidepot: [up('fleet', '🚖', 3000, 40, { fleet: 5 })],
  busdepot: [up('garage', '🅿️', 3000, 40, { fleet: 4 }), up('hybrid', '🔋', 4500, 30, { fleet: 2, jobs: 4 })],
};
const SOUNDS: Record<string, NonNullable<ServiceDef['sound']>> = {
  wind: 'turbine',
  windfarm: 'turbine',
  nuclear: 'machinery',
  geothermal: 'machinery',
  desalination: 'machinery',
  firehelidepot: 'machinery',
  kindergarten: 'kids',
  highschool: 'kids',
  sports: 'kids',
  garden: 'fountain',
  coal: 'machinery',
  gas: 'machinery',
  incinerator: 'machinery',
  crematorium: 'machinery',
  waterplant: 'machinery',
  pumpstation: 'machinery',
  recycling: 'machinery',
  busdepot: 'machinery',
  taxidepot: 'machinery',
  landfill: 'gulls',
  bigpark: 'fountain',
  plaza: 'fountain',
  school: 'kids',
  park: 'kids',
  stadium: 'kids',
};
for (const d of SERVICES) {
  d.upgrades = UPGRADES[d.id];
  d.sound = SOUNDS[d.id];
}

/** Максимум улучшений на здание: битовая маска. */
export const MAX_UPGRADES = 30;

/** Идентификаторы установленных улучшений по маске. */
export function installedUpgrades(def: ServiceDef, mask: number): UpgradeDef[] {
  return (def.upgrades ?? []).filter((_, i) => mask & (1 << i));
}

const effCache = new Map<string, ServiceDef>();

/** Определение службы с учётом установленных улучшений (кэшируется по маске). */
export function effectiveDef(def: ServiceDef, mask: number): ServiceDef {
  if (!mask || !def.upgrades) return def;
  const key = `${def.id}:${mask}`;
  let e = effCache.get(key);
  if (e) return e;
  e = { ...def, provides: def.provides && { ...def.provides }, coverage: def.coverage && { ...def.coverage }, pollution: def.pollution && { ...def.pollution }, waste: def.waste && { ...def.waste }, morgue: def.morgue && { ...def.morgue }, fleet: def.fleet && { ...def.fleet } };
  for (const u of installedUpgrades(def, mask)) {
    const f = u.fx;
    e.upkeep += u.upkeep;
    if (e.provides) {
      if (f.power && e.provides.power) e.provides.power *= f.power;
      if (f.water && e.provides.water) e.provides.water *= f.water;
    }
    if (e.coverage) {
      if (f.radius) e.coverage.radius *= f.radius;
      if (f.strength) e.coverage.strength = Math.min(1.5, e.coverage.strength * f.strength);
    }
    if (e.pollution && f.pollution) e.pollution.strength *= f.pollution;
    if (e.waste) {
      if (f.capacity) e.waste.capacity *= f.capacity;
      if (f.burn) e.waste.burn *= f.burn;
    }
    if (e.morgue) {
      if (f.capacity) e.morgue.capacity *= f.capacity;
      if (f.burn) e.morgue.burn *= f.burn;
    }
    if (e.fleet && f.fleet) e.fleet.count += f.fleet;
    if (f.jobs) e.jobs += f.jobs;
  }
  effCache.set(key, e);
  return e;
}
