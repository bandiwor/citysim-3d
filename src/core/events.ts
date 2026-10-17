import type { Building, MessageKind } from './types';

export interface GameEvents {
  'roads:changed': void;
  'zones:changed': void;
  'stops:changed': void;
  'building:added': Building;
  'building:removed': Building;
  'building:updated': Building;
  'time:day': void;
  'time:month': void;
  'time:year': void;
  message: { text: string; kind: MessageKind };
  'overlay:set': string | null;
  /** запрос на смену инструмента (кнопки, горячие клавиши) */
  'tool:request': string;
  /** инструмент сменился */
  'tool:set': string;
  select: Building | null;
  'economy:changed': void;
  'speed:changed': number;
}
