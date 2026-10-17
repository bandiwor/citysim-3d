import type { Indexed } from '../core/Registry';

export interface RoadType extends Indexed {
  icon: string;
  /** полная ширина дороги с обочинами, ед. */
  width: number;
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
  median: boolean;
  color: number;
}

/** Названия и описания берутся из словарей i18n по ключам `road.<id>.name` / `road.<id>.desc`. */
export const ROADS: RoadType[] = [
  { id: 'street', index: 0, icon: '🛣️', width: 8, cost: 12, upkeep: 0.5, speed: 14, lanes: 1, access: true, laneOffset: 1.5, median: false, color: 0x3b3f46 },
  { id: 'avenue', index: 0, icon: '🚏', width: 12, cost: 30, upkeep: 1.4, speed: 22, lanes: 2, access: true, laneOffset: 2.4, median: true, color: 0x33373d },
  { id: 'highway', index: 0, icon: '🏎️', width: 14, cost: 70, upkeep: 2.6, speed: 34, lanes: 3, access: false, laneOffset: 3, median: true, color: 0x2a2d33 },
];
