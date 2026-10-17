import type { Game } from '../core/Game';
import type { PreviewCell, Tool, ToolContext } from '../core/Tool';
import type { Cell } from '../core/types';
import type { Renderer } from '../render/Renderer';
import { CELL } from '../world/World';

/** Ввод мыши/клавиатуры: управление камерой и передача событий активному инструменту. */
export class Input implements ToolContext {
  readonly game: Game;
  hint = '';
  private _tool: Tool | null = null;
  private _toolId = '';
  private _tools = new Map<string, Tool>();
  private _btn = -1;
  private _last = { x: 0, y: 0 };
  private _moved = 0;
  private _down = false;
  private _cell: Cell | null = null;
  onHint: (text: string, x: number, y: number) => void = () => {};
  onHover: (c: Cell | null) => void = () => {};

  constructor(private _canvas: HTMLCanvasElement, private _renderer: Renderer, game: Game) {
    this.game = game;
    _canvas.addEventListener('pointerdown', (e) => this._onDown(e));
    window.addEventListener('pointermove', (e) => this._onMove(e));
    window.addEventListener('pointerup', (e) => this._onUp(e));
    _canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this._onKey(e));
    game.bus.on('tool:request', (id) => this.setTool(id));
  }

  get toolId(): string {
    return this._toolId;
  }

  setTool(id: string): void {
    if (this._tool) {
      this._tool.cancel?.(this);
      this._tool.deactivate?.(this);
    }
    let tool = this._tools.get(id);
    if (!tool) {
      const item = this.game.toolbar.get(id);
      if (!item) return;
      tool = item.createTool(this.game);
      this._tools.set(id, tool);
    }
    this._tool = tool;
    this._toolId = id;
    this._renderer.grid.lines.visible = !!tool.showGrid;
    this.clearPreview();
    tool.activate?.(this);
    if (id !== 'select') this.game.bus.emit('select', null);
    this.game.bus.emit('tool:set', id);
  }

  setPreview(cells: PreviewCell[], hint?: string): void {
    this._renderer.preview.set(cells);
    this.hint = hint ?? '';
    this.onHint(this.hint, this._last.x, this._last.y);
  }

  clearPreview(): void {
    this._renderer.preview.clear();
    this.hint = '';
    this.onHint('', 0, 0);
  }

  private _cellAt(e: PointerEvent | MouseEvent): Cell | null {
    const p = this._renderer.camera.groundAt(e.clientX, e.clientY);
    if (!p) return null;
    const x = Math.floor(p.x / CELL);
    const y = Math.floor(p.z / CELL);
    return this.game.world.inBounds(x, y) ? { x, y } : null;
  }

  private _onDown(e: PointerEvent): void {
    this._canvas.setPointerCapture(e.pointerId);
    this._btn = e.button;
    this._last = { x: e.clientX, y: e.clientY };
    this._moved = 0;
    this._down = true;
    if (e.button === 0 && this._tool) {
      const c = this._cellAt(e);
      if (c && !this._tool.panOnDrag) this._tool.down?.(c, this);
    }
  }

  private _onMove(e: PointerEvent): void {
    const dx = e.clientX - this._last.x;
    const dy = e.clientY - this._last.y;
    this._last = { x: e.clientX, y: e.clientY };
    const overCanvas = e.target === this._canvas;
    if (this._down) {
      this._moved += Math.abs(dx) + Math.abs(dy);
      const cam = this._renderer.camera;
      if (this._btn === 2) cam.rotate(dx * 0.006, dy * 0.005);
      else if (this._btn === 1) cam.panPixels(dx, dy);
      else if (this._btn === 0 && this._tool?.panOnDrag && this._moved > 4) cam.panPixels(dx, dy);
    }
    if (!overCanvas && !this._down) return;
    const c = this._cellAt(e);
    this._cell = c;
    this.onHover(c);
    if (!this._tool) return;
    if (this._down && this._btn === 0 && c && !this._tool.panOnDrag) this._tool.move?.(c, this);
    else if (!this._down) this._tool.hover?.(c, this);
    if (this.hint) this.onHint(this.hint, e.clientX, e.clientY);
  }

  private _onUp(e: PointerEvent): void {
    if (!this._down) return;
    this._down = false;
    const wasBtn = this._btn;
    this._btn = -1;
    const c = this._cellAt(e) ?? this._cell;
    if (wasBtn === 0 && this._tool && c) {
      if (this._tool.panOnDrag) {
        if (this._moved <= 4) this._tool.up?.(c, this);
      } else this._tool.up?.(c, this);
    } else if (wasBtn === 2 && this._moved < 5 && this._toolId !== 'select') {
      this.setTool('select');
    }
  }

  private _onKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const g = this.game;
    if (e.code === 'Space') {
      e.preventDefault();
      g.setSpeed(g.speed === 0 ? 1 : 0);
      return;
    }
    if (e.code === 'Digit1') return g.setSpeed(1);
    if (e.code === 'Digit2') return g.setSpeed(2);
    if (e.code === 'Digit3') return g.setSpeed(4);
    for (const item of g.toolbar.all()) {
      if (item.hotkey === e.code) {
        this.setTool(item.id);
        return;
      }
    }
  }
}
