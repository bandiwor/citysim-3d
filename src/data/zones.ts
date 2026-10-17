import type { Indexed } from '../core/Registry';

export interface ZoneLevel {
  /** жильцы (жилая зона) или рабочие места (остальные) */
  capacity: number;
  floors: [number, number];
  /** минимальная стоимость земли для апгрейда до этого уровня */
  reqLand: number;
  /** минимальное образование района */
  reqEdu: number;
  pollution: number;
}

export interface ZoneType extends Indexed {
  name: string;
  icon: string;
  desc: string;
  color: number;
  /** жилая зона: даёт население */
  housing: boolean;
  /** налоговая база за единицу вместимости в месяц при ставке 100% */
  wage: number;
  powerPer: number;
  waterPer: number;
  cost: number;
  levels: ZoneLevel[];
}

export const ZONES: ZoneType[] = [
  {
    id: 'res', index: 0, name: 'Жилая', icon: '🏠', desc: 'Дома и жилые комплексы. Нужны дорога, электричество и вода.',
    color: 0x4caf50, housing: true, wage: 24, powerPer: 0.4, waterPer: 0.5, cost: 2,
    levels: [
      { capacity: 8, floors: [1, 2], reqLand: 0, reqEdu: 0, pollution: 0 },
      { capacity: 26, floors: [3, 5], reqLand: 0.42, reqEdu: 0.1, pollution: 0 },
      { capacity: 80, floors: [8, 14], reqLand: 0.62, reqEdu: 0.35, pollution: 0 },
    ],
  },
  {
    id: 'com', index: 0, name: 'Коммерческая', icon: '🏪', desc: 'Магазины и офисы: рабочие места и налоги.',
    color: 0x2196f3, housing: false, wage: 26, powerPer: 0.8, waterPer: 0.3, cost: 2,
    levels: [
      { capacity: 7, floors: [1, 2], reqLand: 0, reqEdu: 0, pollution: 0 },
      { capacity: 24, floors: [3, 5], reqLand: 0.45, reqEdu: 0.1, pollution: 0 },
      { capacity: 70, floors: [8, 14], reqLand: 0.65, reqEdu: 0.4, pollution: 0 },
    ],
  },
  {
    id: 'ind', index: 0, name: 'Промышленная', icon: '🏭', desc: 'Заводы: много рабочих мест, но загрязняют воздух.',
    color: 0xffc107, housing: false, wage: 19, powerPer: 1.5, waterPer: 0.6, cost: 2,
    levels: [
      { capacity: 12, floors: [1, 2], reqLand: 0, reqEdu: 0, pollution: 1.0 },
      { capacity: 30, floors: [2, 3], reqLand: 0.35, reqEdu: 0.1, pollution: 0.85 },
      { capacity: 56, floors: [2, 4], reqLand: 0.55, reqEdu: 0.3, pollution: 0.5 },
    ],
  },
];
