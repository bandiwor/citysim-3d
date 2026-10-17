import type { Indexed } from '../core/Registry';

export interface RoadType extends Indexed {
  name: string;
  icon: string;
  desc: string;
  /** цена за клетку */
  cost: number;
  /** содержание в месяц за клетку */
  upkeep: number;
  /** скорость, ед/с */
  speed: number;
  /** сколько машин комфортно помещается в клетке */
  capacity: number;
  /** могут ли здания подключаться к этой дороге */
  access: boolean;
  /** смещение полосы от оси */
  laneOffset: number;
  median: boolean;
  color: number;
}

export const ROADS: RoadType[] = [
  { id: 'street', index: 0, name: 'Улица', icon: '🛣️', desc: 'Двухполосная улица. К ней подключаются здания.', cost: 12, upkeep: 0.5, speed: 14, capacity: 6, access: true, laneOffset: 1.3, median: false, color: 0x3b3f46 },
  { id: 'avenue', index: 0, name: 'Проспект', icon: '🚏', desc: 'Широкий проспект: быстрее и вместительнее.', cost: 30, upkeep: 1.4, speed: 22, capacity: 14, access: true, laneOffset: 1.9, median: true, color: 0x33373d },
  { id: 'highway', index: 0, name: 'Магистраль', icon: '🏎️', desc: 'Скоростная трасса. Здания к ней не подключаются.', cost: 70, upkeep: 2.6, speed: 34, capacity: 26, access: false, laneOffset: 2.1, median: true, color: 0x2a2d33 },
];

/** Множитель цены моста (дорога по воде). */
export const BRIDGE_COST_MUL = 3;
