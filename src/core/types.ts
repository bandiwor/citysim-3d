export type BuildingKind = 'zone' | 'service';

/** Экземпляр здания в мире (жилое/коммерческое/промышленное либо служба). */
export interface Building {
  id: number;
  kind: BuildingKind;
  /** id зоны или службы */
  defId: string;
  /** id зоны ('' для служб) */
  zone: string;
  level: number;
  variant: number;
  rot: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** индекс клетки-якоря */
  cell: number;
  /** индекс клетки дороги, к которой подключено здание (-1 — нет) */
  access: number;
  /** компонента связности дорожной сети */
  comp: number;
  pop: number;
  cap: number;
  jobs: number;
  workers: number;
  powerNeed: number;
  waterNeed: number;
  powerOut: number;
  waterOut: number;
  upkeep: number;
  powered: boolean;
  watered: boolean;
  happiness: number;
  goods: number;
  abandoned: boolean;
  /** секунд без коммунальных услуг */
  outage: number;
  /** секунд в заброшенном состоянии */
  decay: number;
  /** >0 — здание горит (секунд) */
  fire: number;
}

export interface Cell {
  x: number;
  y: number;
}

export type MessageKind = 'info' | 'good' | 'warn' | 'bad';
