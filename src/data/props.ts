/** Что можно сажать: деревья, кусты, цветы и камни. Тексты: `prop.<id>.name`. */
export interface PropDef {
  id: string;
  icon: string;
  /** цена за штуку */
  cost: number;
  /** диапазон масштаба */
  scale: [number, number];
  /** минимальное расстояние до соседей при масштабе 1, ед. */
  spacing: number;
  /** оттенки (множитель цвета экземпляра): [мин, макс] */
  shade: [number, number];
}

export const PROPS: PropDef[] = [
  { id: 'oak', icon: '🌳', cost: 8, scale: [0.5, 0.9], spacing: 2.2, shade: [0.75, 1.15] },
  { id: 'pine', icon: '🌲', cost: 6, scale: [0.5, 1.0], spacing: 1.9, shade: [0.7, 1.1] },
  { id: 'birch', icon: '🪵', cost: 8, scale: [0.5, 0.85], spacing: 2, shade: [0.85, 1.15] },
  { id: 'palm', icon: '🌴', cost: 12, scale: [0.5, 0.8], spacing: 2.2, shade: [0.85, 1.1] },
  { id: 'bush', icon: '🌿', cost: 3, scale: [0.6, 1.3], spacing: 1.6, shade: [0.7, 1.2] },
  { id: 'flowers', icon: '🌸', cost: 2, scale: [0.7, 1.3], spacing: 1.2, shade: [0.9, 1.1] },
  { id: 'rock', icon: '🪨', cost: 2, scale: [0.5, 1.1], spacing: 1.3, shade: [0.7, 1.2] },
  { id: 'boulder', icon: '⛰️', cost: 6, scale: [0.7, 1.4], spacing: 2.4, shade: [0.75, 1.1] },
];
