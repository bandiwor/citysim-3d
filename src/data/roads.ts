import type { Indexed } from '../core/Registry';

export type MedianKind = 'none' | 'grass' | 'trees' | 'barrier';
export type MarkingKind = 'none' | 'dash' | 'double';

export interface RoadType extends Indexed {
  icon: string;
  /** полная ширина дороги с обочинами, ед. */
  width: number;
  /** ширина тротуара с каждой стороны, ед. (0 — без тротуара) */
  sidewalk: number;
  median: MedianKind;
  marking: MarkingKind;
  /** движение только от начала к концу построенного отрезка */
  oneway: boolean;
  /** цена за каждые costUnit ед. длины */
  cost: number;
  /** содержание в месяц за каждые costUnit ед. длины */
  upkeep: number;
  /** скорость, ед/с */
  speed: number;
  /** относительная пропускная способность (число полос в одну сторону) */
  lanes: number;
  /** здания подключаются, зоны строятся вдоль дороги */
  access: boolean;
  /** смещение полосы движения от оси, ед. */
  laneOffset: number;
  color: number;
}

/** Названия и описания берутся из словарей i18n по ключам `road.<id>.name` / `road.<id>.desc`. */
export const ROADS: RoadType[] = [
  { id: 'alley', index: 0, icon: '🏘️', width: 6, sidewalk: 0.8, median: 'none', marking: 'none', oneway: false, cost: 7, upkeep: 0.3, speed: 9, lanes: 1, access: true, laneOffset: 1.1, color: 0x4a4d52 },
  { id: 'street', index: 0, icon: '🛣️', width: 8, sidewalk: 1.1, median: 'none', marking: 'dash', oneway: false, cost: 12, upkeep: 0.5, speed: 14, lanes: 1, access: true, laneOffset: 1.5, color: 0x3b3f46 },
  { id: 'oneway', index: 0, icon: '➡️', width: 7, sidewalk: 1.1, median: 'none', marking: 'dash', oneway: true, cost: 11, upkeep: 0.5, speed: 15, lanes: 1, access: true, laneOffset: 0, color: 0x3d4148 },
  { id: 'country', index: 0, icon: '🌾', width: 8, sidewalk: 0, median: 'none', marking: 'dash', oneway: false, cost: 9, upkeep: 0.4, speed: 20, lanes: 1, access: true, laneOffset: 1.6, color: 0x5d5a55 },
  { id: 'avenue', index: 0, icon: '🚏', width: 12, sidewalk: 1.1, median: 'grass', marking: 'dash', oneway: false, cost: 30, upkeep: 1.4, speed: 22, lanes: 2, access: true, laneOffset: 2.4, color: 0x33373d },
  { id: 'boulevard', index: 0, icon: '🌳', width: 18, sidewalk: 1.8, median: 'trees', marking: 'dash', oneway: false, cost: 52, upkeep: 2.2, speed: 24, lanes: 3, access: true, laneOffset: 3.6, color: 0x30343a },
  { id: 'highway', index: 0, icon: '🏎️', width: 14, sidewalk: 0.6, median: 'barrier', marking: 'double', oneway: false, cost: 70, upkeep: 2.6, speed: 34, lanes: 3, access: false, laneOffset: 3, color: 0x2a2d33 },
];
