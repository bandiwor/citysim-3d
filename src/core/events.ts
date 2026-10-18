import type { Building, MessageKind, MessageParams } from './types';

export interface GameEvents {
  'roads:changed': void;
  'zones:changed': void;
  'stops:changed': void;
  'terrain:changed': void;
  /** изменились посаженные игроком деревья и камни */
  'props:changed': void;
  /** ластик природы стёр всё в круге (процедурные деревья тоже) */
  'props:erase': { x: number; z: number; r: number };
  /** войти в режим от первого лица в точке */
  'fp:enter': { x: number; z: number };
  'fp:exit': void;
  'routes:changed': void;
  /** изменились модификаторы (политики, события) */
  'mods:changed': void;
  /** новое событие города ждёт решения игрока */
  'event:show': void;
  /** достигнут новый уровень города */
  'progress:level': number;
  /** открылось новое содержимое (панель инструментов обновляет замки) */
  'tool:unlocked': void;
  /** цели обновились */
  'objectives:changed': void;
  /** здание зоны вот-вот появится (поля ещё можно поменять: специализация, вариант) */
  'building:spawning': Building;
  'building:added': Building;
  'building:removed': Building;
  'building:updated': Building;
  'time:day': void;
  'weather:changed': string;
  'trade:changed': void;
  'time:month': void;
  'time:year': void;
  /** сообщение игроку: ключ словаря i18n + параметры */
  message: { key: string; params?: MessageParams; kind: MessageKind };
  /** звуковой эффект действия */
  sfx: { name: string };
  'overlay:set': string | null;
  /** запрос на смену инструмента (кнопки, горячие клавиши) */
  'tool:request': string;
  /** инструмент сменился */
  'tool:set': string;
  select: Building | null;
  /** выбрана остановка (id) */
  'select:stop': number | null;
  'economy:changed': void;
  'speed:changed': number;
}
