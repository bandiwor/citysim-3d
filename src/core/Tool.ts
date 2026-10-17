import type { Game } from './Game';
import type { Cell } from './types';

/** Подсвеченная клетка предпросмотра: ok = можно строить. */
export interface PreviewCell {
  x: number;
  y: number;
  ok: boolean;
}

export interface ToolContext {
  game: Game;
  setPreview(cells: PreviewCell[], hint?: string): void;
  clearPreview(): void;
}

/** Инструмент игрока (дорога, зона, здание, снос…). Регистрируется через ToolbarItem. */
export interface Tool {
  readonly id: string;
  /** Левая кнопка с перетаскиванием двигает камеру (для инструмента-выбора). */
  panOnDrag?: boolean;
  /** Показывать сетку клеток. */
  showGrid?: boolean;
  activate?(ctx: ToolContext): void;
  deactivate?(ctx: ToolContext): void;
  hover?(cell: Cell | null, ctx: ToolContext): void;
  down?(cell: Cell, ctx: ToolContext): void;
  move?(cell: Cell, ctx: ToolContext): void;
  up?(cell: Cell, ctx: ToolContext): void;
  cancel?(ctx: ToolContext): void;
}

export interface ToolbarCategory {
  id: string;
  name: string;
  icon: string;
}

export interface ToolbarItem {
  id: string;
  category: string;
  name: string;
  icon: string;
  desc?: string;
  cost?: number;
  hotkey?: string;
  createTool(game: Game): Tool;
}
