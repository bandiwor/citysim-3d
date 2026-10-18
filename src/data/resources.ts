import type { GameConfig } from '../config/gameConfig';
import type { Building } from '../core/types';

/** Природные ресурсы клетки карты. */
export const RESOURCE_KINDS = ['fertile', 'forest', 'ore', 'oil'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** Специализация промышленности на ресурсе: фермы, лесопилки, шахты, нефтевышки. */
export interface SpecDef {
  id: string;
  resource: ResourceKind;
  icon: string;
  /** ценность сырья для экспорта (множитель к trade.goodsPerWorker) */
  value: number;
  /** множитель загрязнения относительно обычной промышленности того же уровня */
  pollution: number;
  /** множитель рабочих мест */
  jobs: number;
  /** доли рабочих мест: без образования, со средним, с высшим */
  eduMix: [number, number, number];
  /** истощает запасы вокруг (руда, нефть) */
  depletes: boolean;
  /** цвет на карте ресурсов */
  color: number;
}

export const SPECS: SpecDef[] = [
  { id: 'farm', resource: 'fertile', icon: '🌾', value: 1.0, pollution: 0, jobs: 0.85, eduMix: [0.9, 0.1, 0], depletes: false, color: 0x9ed26a },
  { id: 'forest', resource: 'forest', icon: '🪵', value: 1.15, pollution: 0.35, jobs: 0.9, eduMix: [0.85, 0.15, 0], depletes: false, color: 0x2f9a52 },
  { id: 'ore', resource: 'ore', icon: '⛏️', value: 1.5, pollution: 1.4, jobs: 1, eduMix: [0.75, 0.25, 0], depletes: true, color: 0xc49a62 },
  { id: 'oil', resource: 'oil', icon: '🛢️', value: 1.9, pollution: 1.8, jobs: 0.9, eduMix: [0.6, 0.35, 0.05], depletes: true, color: 0x4a4f5c },
];

export const specDef = (id: string): SpecDef | undefined => SPECS.find((s) => s.id === id);

/** Доли рабочих мест по образованию у здания зоны с учётом специализации. */
export function eduMixOf(b: Building, levelMix: [number, number, number]): [number, number, number] {
  return (b.spec && specDef(b.spec)?.eduMix) || levelMix;
}

/** Множитель загрязнения здания с учётом специализации. */
export const pollutionMulOf = (b: Building): number => (b.spec ? (specDef(b.spec)?.pollution ?? 1) : 1);

export type ResourcesConfig = GameConfig['resources'];
