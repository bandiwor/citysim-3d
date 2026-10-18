import type { Indexed } from '../core/Registry';

/** Ступень плотности застройки: низкая / средняя / высокая. Выбирается игроком при заливке зоны. */
export interface ZoneLevel {
  /** жильцы (жилая зона) или рабочие места (остальные) при благосостоянии 1 */
  capacity: number;
  floors: [number, number];
  pollution: number;
  /** доли рабочих мест по образованию работников: [без образования, среднее, высшее] (для нежилых зон) */
  eduMix: [number, number, number];
}

/** Благосостояние здания внутри плотности (★): богаче — больше вместимость, налоги и приличнее вид. */
export interface ZoneWealth {
  capMul: number;
  taxMul: number;
  /** минимальная стоимость земли и образование района для перехода на эту ступень */
  reqLand: number;
  reqEdu: number;
}

export interface ZoneType extends Indexed {
  icon: string;
  color: number;
  /** жилая зона: даёт население */
  housing: boolean;
  /** налоговая база за единицу вместимости в месяц при ставке 100% */
  wage: number;
  powerPer: number;
  waterPer: number;
  cost: number;
  /** ступени плотности (индекс 0 — низкая) */
  levels: ZoneLevel[];
  /** ступени благосостояния ★1..★3 */
  wealth: ZoneWealth[];
}

const WEALTH: ZoneWealth[] = [
  { capMul: 1, taxMul: 1, reqLand: 0, reqEdu: 0 },
  { capMul: 1.2, taxMul: 1.25, reqLand: 0.4, reqEdu: 0.1 },
  { capMul: 1.45, taxMul: 1.6, reqLand: 0.6, reqEdu: 0.3 },
];

export const ZONES: ZoneType[] = [
  {
    id: 'res', index: 0, icon: '🏠',
    color: 0x4caf50, housing: true, wage: 24, powerPer: 0.4, waterPer: 0.5, cost: 2,
    wealth: WEALTH,
    levels: [
      { capacity: 8, floors: [1, 2], pollution: 0, eduMix: [0, 0, 0] },
      { capacity: 26, floors: [3, 5], pollution: 0, eduMix: [0, 0, 0] },
      { capacity: 80, floors: [8, 14], pollution: 0, eduMix: [0, 0, 0] },
    ],
  },
  {
    id: 'com', index: 0, icon: '🏪',
    color: 0x2196f3, housing: false, wage: 26, powerPer: 0.8, waterPer: 0.3, cost: 2,
    wealth: WEALTH,
    levels: [
      { capacity: 7, floors: [1, 2], pollution: 0, eduMix: [0.75, 0.25, 0] },
      { capacity: 24, floors: [3, 5], pollution: 0, eduMix: [0.5, 0.4, 0.1] },
      { capacity: 70, floors: [8, 14], pollution: 0, eduMix: [0.2, 0.5, 0.3] },
    ],
  },
  {
    // низкая плотность — мастерские, средняя — заводы, высокая — офисы (нужны образованные работники, не загрязняют)
    id: 'ind', index: 0, icon: '🏭',
    color: 0xffc107, housing: false, wage: 19, powerPer: 1.5, waterPer: 0.6, cost: 2,
    wealth: WEALTH,
    levels: [
      { capacity: 12, floors: [1, 2], pollution: 1.0, eduMix: [0.75, 0.25, 0] },
      { capacity: 34, floors: [2, 4], pollution: 0.8, eduMix: [0.5, 0.45, 0.05] },
      { capacity: 48, floors: [5, 12], pollution: 0, eduMix: [0.05, 0.35, 0.6] },
    ],
  },
];

/** Доли рабочих мест по образованию для служб. */
export const SERVICE_EDU_MIX: [number, number, number] = [0.4, 0.5, 0.1];
