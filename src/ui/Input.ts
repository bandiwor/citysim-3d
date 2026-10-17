import type { Game } from '../core/Game';
import type { PreviewState, Tool, ToolContext } from '../core/Tool';
import type { Pointer } from '../core/types';
import type { Renderer } from '../render/Renderer';

const emptyPreview = (): PreviewState => ({ quads: [], ribbon: null, ring: null, marker: null, marks: [], hint: '' });

/** Ввод мыши/клавиатуры: управление камерой и передача событий активному инструменту. */
export class Input implements ToolContext {
  readonly game: Game;
  shift = false;
  tool: Tool | null = null;
  private _toolId = '';
  private _tools = new Map<string, Tool>();
  private _btn = -1;
  private _last = { x: 0, y: 0 };
  private _moved = 0;
  private _down = false;
  private _lastP: Pointer | null = null;
  /** активные касания: два пальца — жесты камеры (сдвиг, щипок, поворот) */
  private _touches = new Map<number, { x: number; y: number }>();
  private _gesture: { cx: number; cy: number; dist: number; ang: number } | null = null;
  /** после жеста игнорируем оставшийся палец до полного отпускания */
  private _gestureTail = false;
  /** касание: инструмент с подтверждением — первое нажатие показывает превью, второе рядом ставит */
  private _pendingTap: Pointer | null = null;
  /** первое лицо: ввод инструментов отключён */
  locked = false;
  private _preview = emptyPreview();
  onHint: (text: string, x: number, y: number) => void = () => {};
  onHover: (p: Pointer | null) => void = () => {};

  constructor(private _canvas: HTMLCanvasElement, private _renderer: Renderer, game: Game) {
    this.game = game;
    _canvas.addEventListener('pointerdown', (e) => this._onDown(e));
    window.addEventListener('pointermove', (e) => this._onMove(e));
    window.addEventListener('pointerup', (e) => this._onUp(e));
    window.addEventListener('pointercancel', () => this._reset());
    window.addEventListener('blur', () => this._reset());
    document.addEventListener('pointerleave', (e) => e.pointerType !== 'touch' && this._leave());
    _canvas.addEventListener('pointerleave', (e) => e.pointerType !== 'touch' && this._leave());
    _canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this._onKey(e));
    window.addEventListener('keyup', (e) => (this.shift = e.shiftKey));
    game.bus.on('tool:request', (id) => this.setTool(id));
  }

  get toolId(): string {
    return this._toolId;
  }

  setTool(id: string): void {
    const lockKey = this.game.get('progress').toolKey(id);
    if (this.game.toolbar.has(id) && !this.game.get('progress').isUnlocked(lockKey)) {
      this.game.message('err.locked', undefined, 'bad');
      this.game.sfx('error');
      return;
    }
    if (this.tool) this.tool.deactivate?.(this);
    let tool = this._tools.get(id);
    if (!tool) {
      const item = this.game.toolbar.get(id);
      if (!item) return;
      if (!this.game.get('progress').isUnlocked(this.game.get('progress').toolKey(id))) {
        this.game.message('err.locked', undefined, 'bad');
        this.game.sfx('error');
        return;
      }
      tool = item.createTool(this.game);
      this._tools.set(id, tool);
    }
    this.tool = tool;
    this._toolId = id;
    this._renderer.zoneLayer.setGridVisible(!!tool.showGrid);
    this._pendingTap = null;
    this.clearPreview();
    tool.activate?.(this);
    if (id !== 'select') this.game.bus.emit('select', null);
    this.game.bus.emit('tool:set', id);
  }

  /** Каждый кадр: повторяющиеся действия инструмента (кисть рельефа). */
  tick(dt: number): void {
    if (!this.locked) this.tool?.tick?.(dt, this);
  }

  setPreview(p: Partial<PreviewState>): void {
    this._preview = { ...this._preview, ...p };
    this._renderer.preview.apply(this._preview);
    this.onHint(this._preview.hint, this._last.x, this._last.y);
  }

  clearPreview(): void {
    this._preview = emptyPreview();
    this._renderer.preview.clear();
    this.onHint('', 0, 0);
  }

  private _pointer(e: PointerEvent | MouseEvent): Pointer | null {
    const p = this._renderer.camera.groundAt(e.clientX, e.clientY);
    return p ? { x: p.x, z: p.z, shift: e.shiftKey } : null;
  }

  /** Курсор ушёл с карты: убрать кисть/подсветку и прервать зажатый ввод. */
  private _leave(): void {
    if (this._down) return;
    this._lastP = null;
    this.tool?.hover?.(null, this);
    this.clearPreview();
    this.onHover(null);
  }

  /** Потеря фокуса / отмена указателя: завершить зажатый ввод, не оставляя «залипшей» кисти. */
  private _reset(): void {
    if (this._down && this._btn === 0 && this.tool && this._lastP && !this.tool.panOnDrag) this.tool.up?.(this._lastP, this);
    this._down = false;
    this._btn = -1;
    this._lastP = null;
    this._touches.clear();
    this._gesture = null;
    this._gestureTail = false;
    this.tool?.hover?.(null, this);
    this.clearPreview();
  }

  /** Инструменты, где касанием легко ошибиться: ставятся вторым касанием в то же место. */
  private get _confirmTool(): boolean {
    const id = this._toolId;
    return id.startsWith('service:') || id.startsWith('light:') || id === 'stop' || id === 'walk';
  }

  private _gestureState(): { cx: number; cy: number; dist: number; ang: number } | null {
    const pts = [...this._touches.values()];
    if (pts.length < 2) return null;
    const [a, b] = pts;
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.hypot(b.x - a.x, b.y - a.y) || 1, ang: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  /** Касание: true — событие поглощено жестом камеры. */
  private _touchDown(e: PointerEvent): boolean {
    this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this._canvas.setPointerCapture(e.pointerId);
    if (this._touches.size >= 2) {
      // второй палец отменяет начатое действие инструмента и включает камеру
      if (this._down) this.cancelDrag();
      this._gesture = this._gestureState();
      this._gestureTail = true;
      return true;
    }
    this._gestureTail = false;
    return false;
  }

  private _touchMove(e: PointerEvent): boolean {
    if (!this._touches.has(e.pointerId)) return false;
    this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._touches.size < 2) return this._gestureTail;
    const g = this._gestureState();
    const prev = this._gesture;
    if (g && prev) {
      const cam = this._renderer.camera;
      cam.panPixels(g.cx - prev.cx, g.cy - prev.cy);
      cam.zoom(prev.dist / g.dist);
      let da = g.ang - prev.ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      cam.rotate(-da, 0);
    }
    this._gesture = g;
    return true;
  }

  /** Прервать зажатый ввод без вызова up (второй палец, смена режима). */
  cancelDrag(): void {
    this._down = false;
    this._btn = -1;
    this.tool?.escape?.(this);
    this.clearPreview();
  }

  /** Нажатие «клавиши» с экранных кнопок. */
  press(code: string): void {
    if (this.locked) return;
    if (this.tool?.key?.(code, this)) this.game.bus.emit('tool:set', this._toolId);
  }

  /** Экранная кнопка «отмена» (аналог ПКМ / Esc). */
  cancel(): void {
    this._pendingTap = null;
    this._escape();
  }

  private _onDown(e: PointerEvent): void {
    if (this.locked) return;
    if (e.pointerType === 'touch' && this._touchDown(e)) return;
    if (this._gestureTail) return;
    if (e.pointerType === 'touch' && this._confirmTool) {
      const p = this._pointer(e);
      if (!p) return;
      const near = this._pendingTap && Math.hypot(this._pendingTap.x - p.x, this._pendingTap.z - p.z) < 10;
      if (!near) {
        this._pendingTap = p;
        this._lastP = p;
        this.tool?.hover?.(p, this);
        return;
      }
      this._pendingTap = null;
    }
    this._canvas.setPointerCapture(e.pointerId);
    this._btn = e.button;
    this._last = { x: e.clientX, y: e.clientY };
    this._moved = 0;
    this._down = true;
    this.shift = e.shiftKey;
    if (e.button === 0 && this.tool && !this.tool.panOnDrag) {
      const p = this._pointer(e);
      if (p) this.tool.down?.(p, this);
    }
  }

  private _onMove(e: PointerEvent): void {
    if (e.pointerType === 'touch' && !this.locked && this._touchMove(e)) return;
    if (this._gestureTail) return;
    const dx = e.clientX - this._last.x;
    const dy = e.clientY - this._last.y;
    this._last = { x: e.clientX, y: e.clientY };
    this.shift = e.shiftKey;
    if (this.locked) return;
    const overCanvas = e.target === this._canvas;
    if (this._down) {
      this._moved += Math.abs(dx) + Math.abs(dy);
      const cam = this._renderer.camera;
      if (this._btn === 2) cam.rotate(dx * 0.006, dy * 0.005);
      else if (this._btn === 1) cam.panPixels(dx, dy);
      else if (this._btn === 0 && this.tool?.panOnDrag && this._moved > 4) cam.panPixels(dx, dy);
    }
    if (!overCanvas && !this._down) return this._leave();
    const p = this._pointer(e);
    if (p) this._lastP = p;
    this.onHover(p);
    if (!this.tool) return;
    if (this._down && this._btn === 0 && p && !this.tool.panOnDrag) this.tool.move?.(p, this);
    else if (!this._down) this.tool.hover?.(p, this);
    if (this._preview.hint) this.onHint(this._preview.hint, e.clientX, e.clientY);
  }

  private _onUp(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this._touches.delete(e.pointerId);
      if (this._touches.size < 2) this._gesture = null;
      if (this._gestureTail) {
        if (this._touches.size === 0) this._gestureTail = false;
        return;
      }
    }
    if (!this._down) return;
    this._down = false;
    const btn = this._btn;
    this._btn = -1;
    const p = this._pointer(e) ?? this._lastP;
    if (btn === 0 && this.tool && p) {
      if (!this.tool.panOnDrag || this._moved <= 4) this.tool.up?.(p, this);
    } else if (btn === 2 && this._moved < 5) this._escape();
  }

  /** ПКМ / Esc: отменить текущую операцию инструмента, иначе вернуться к «Выбору». */
  private _escape(): void {
    if (this.tool?.escape?.(this)) return;
    if (this._toolId !== 'select') this.setTool('select');
    else {
      this.game.bus.emit('select', null);
      this.clearPreview();
    }
  }

  private _onKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    this.shift = e.shiftKey;
    const g = this.game;
    if (this.locked) return;
    if (this.tool?.key?.(e.code, this)) {
      this.game.bus.emit('tool:set', this._toolId);
      return;
    }
    if (e.code === 'Escape') return this._escape();
    if (e.code === 'Space') {
      e.preventDefault();
      g.setSpeed(g.speed === 0 ? 1 : 0);
      return;
    }
    const speeds = g.config.time.speeds;
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (digit && speeds[Number(digit[1])] !== undefined) return g.setSpeed(speeds[Number(digit[1])]);
    for (const item of g.toolbar.all()) {
      if (item.hotkey === e.code && item.hotkey !== 'Escape') {
        this.setTool(item.id);
        return;
      }
    }
  }
}
