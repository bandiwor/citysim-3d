import type { Building, MessageKind, MessageParams } from './types';

export interface GameEvents {
  'roads:changed': void;
  'zones:changed': void;
  'stops:changed': void;
  'terrain:changed': void;
  /** войти в режим от первого лица в точке */
  'fp:enter': { x: number; z: number };
  'fp:exit': void;
  'routes:changed': void;
  'building:added': Building;
  'building:removed': Building;
  'building:updated': Building;
  'time:day': void;
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
