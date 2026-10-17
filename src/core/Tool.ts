import type { Game } from './Game';
import type { Pointer } from './types';
import type { Vec2 } from '../world/geometry';

/** Подсвеченный квадрат/прямоугольник на земле (клетка зоны, основание здания). */
export interface PreviewQuad {
  x: number;
  z: number;
  rot: number;
  w: number;
  d: number;
  ok: boolean;
}

export interface PreviewRibbon {
  pts: Vec2[];
  hw: number;
  ok: boolean;
}

export interface PreviewState {
  quads: PreviewQuad[];
  ribbon: PreviewRibbon | null;
  /** кольцо кисти */
  ring: { x: number; z: number; r: number; ok: boolean } | null;
  /** маркер привязки */
  marker: { x: number; z: number; ok: boolean } | null;
  /** подсказка у курсора (уже переведённая) */
  hint: string;
}

export interface ToolContext {
  game: Game;
  setPreview(p: Partial<PreviewState>): void;
  clearPreview(): void;
  /** состояние клавиш-модификаторов */
  shift: boolean;
}

export interface ToolOption {
  id: string;
  /** ключ i18n названия опции */
  labelKey: string;
  choices: { id: string; labelKey: string }[];
  get(): string;
  set(id: string): void;
}

/** Инструмент игрока (дорога, зона, здание, снос…). Регистрируется через ToolbarItem. */
export interface Tool {
  readonly id: string;
  /** Левая кнопка с перетаскиванием двигает камеру (для инструмента-выбора). */
  panOnDrag?: boolean;
  /** Показывать клетки зонирования. */
  showGrid?: boolean;
  options?: ToolOption[];
  activate?(ctx: ToolContext): void;
  deactivate?(ctx: ToolContext): void;
  hover?(p: Pointer | null, ctx: ToolContext): void;
  down?(p: Pointer, ctx: ToolContext): void;
  move?(p: Pointer, ctx: ToolContext): void;
  up?(p: Pointer, ctx: ToolContext): void;
  /** ПКМ/Esc: вернуть true, если был активный процесс и он отменён (инструмент остаётся выбранным). */
  escape?(ctx: ToolContext): boolean;
  /** горячая клавиша внутри инструмента; true — обработана */
  key?(code: string, ctx: ToolContext): boolean;
}

export interface ToolbarCategory {
  id: string;
  icon: string;
}

export interface ToolbarItem {
  id: string;
  category: string;
  /** ключи словаря i18n */
  nameKey: string;
  descKey?: string;
  icon: string;
  cost?: number;
  hotkey?: string;
  createTool(game: Game): Tool;
}
