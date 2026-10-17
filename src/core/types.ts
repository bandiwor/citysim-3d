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
  /** центр, мировые координаты */
  x: number;
  z: number;
  /** рыскание: локальная +Z (фасад) смотрит на дорогу */
  rot: number;
  /** размеры основания, ед. */
  w: number;
  d: number;
  /** id клетки зонирования (0 — у служб) */
  cell: number;
  /** ребро дороги, к которому подключено здание (0 — нет) */
  access: number;
  accessS: number;
  /** компонента связности дорожной сети (-1 — нет) */
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
  /** накопленный мусор */
  garbage: number;
  /** тела, ожидающие вывоза (жилые) */
  dead: number;
  /** хранилище службы: мусор на свалке/в сжигателе либо тела на кладбище/в крематории */
  stored: number;
  /** >0 — идёт ограбление (секунд до исхода) */
  incident: number;
  /** маска установленных улучшений службы */
  up: number;
}

export interface BusStop {
  id: number;
  edge: number;
  s: number;
  x: number;
  z: number;
}

export type MessageKind = 'info' | 'good' | 'warn' | 'bad';

export interface MessageParams {
  [k: string]: string | number;
}

/** Точка на карте в мировых координатах. */
export interface Pointer {
  x: number;
  z: number;
  shift: boolean;
}
