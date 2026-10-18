import { keys } from './keybinds';
import type { Game } from '../core/Game';
import type { PreviewState, Tool, ToolContext } from '../core/Tool';
import type { Pointer } from '../core/types';
import type { Renderer } from '../render/Renderer';

const emptyPreview = (): PreviewState => ({ quads: [], ribbon: null, ring: null, marker: null, marks: [], hint: '' });

/** Ввод мыши/клавиатуры: управление камерой и передача событий активному инструменту. */
export class Input implements ToolContext {
  readonly game: Game;
  shift = false;
  touch = false;
  metersPerPx = 0.25;
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
  /** жест двух пальцев: режим фиксируется по первому явному движению, чтобы щипок, поворот и наклон не мешали друг другу */
  private _gm: { mode: '' | 'tilt' | 'pinch'; zoom: number; rot: number; tilt: number; zoomOn: boolean; rotOn: boolean } = { mode: '', zoom: 0, rot: 0, tilt: 0, zoomOn: false, rotOn: false };
  /** один палец: пока не сдвинулся — это тап, после порога — сдвиг камеры */
  private _tp: { id: number; sx: number; sy: number; lx: number; ly: number; moved: boolean; t0: number } | null = null;
  /** касание: кисти рисуют пальцем (true) или палец двигает камеру (false) */
  touchDraw = false;
  /** после жеста игнорируем оставшийся палец до полного отпускания */
  private _gestureTail = false;
  /** касание: инструмент с подтверждением — первое нажатие показывает превью, второе рядом ставит */
  private _pendingTap: Pointer | null = null;
  private _pendingScreen = { x: 0, y: 0 };
  /** первое лицо: ввод инструментов отключён */
  locked = false;
  private _preview = emptyPreview();
  onHint: (text: string, x: number, y: number) => void = () => {};
  onHover: (p: Pointer | null) => void = () => {};
  /** сообщает UI о состоянии касательного ввода (ждёт подтверждения и т.п.) */
  onTouchState: () => void = () => {};

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

  /** Esc при инструменте «Выбор»: закрыть раздел панели / снять выбор / открыть меню; true — обработано. */
  onIdleEscape?: () => boolean;
  /** поверх игры открыто окно */
  isBlocked?: () => boolean;

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
    this.touchDraw = false;
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
    const cam = this._renderer.camera;
    const p = cam.groundAt(e.clientX, e.clientY);
    this.touch = (e as PointerEvent).pointerType === 'touch';
    // масштаб в точке ввода: на сколько метров сдвигается земля при сдвиге на 40 пикселей
    const q = p && cam.groundAt(e.clientX + 40, e.clientY);
    if (p && q) this.metersPerPx = Math.max(0.02, Math.hypot(q.x - p.x, q.z - p.z) / 40);
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
    this._tp = null;
    this._pendingTap = null;
    this._gestureTail = false;
    this.tool?.hover?.(null, this);
    this.clearPreview();
  }

  /** Кисти: водят пальцем по карте (в режиме «рисовать»). */
  private get _brushTool(): boolean {
    const id = this._toolId;
    return id.startsWith('zone:') || id.startsWith('terraform:') || id.startsWith('prop:') || id === 'bulldoze';
  }

  /** Касание: «ставящие» инструменты (дороги, здания, службы…) — тап показывает точку, подтверждение ставит; палец при этом свободно двигает камеру. */
  private get _confirmTool(): boolean {
    return !this.tool?.panOnDrag && !this._brushTool;
  }

  /** Есть точка, ждущая подтверждения (кнопка ✔ или повторный тап). */
  get hasPending(): boolean {
    return !!this._pendingTap;
  }

  /** Подтвердить ожидающую точку (кнопка ✔); без неё — нажатие Enter инструмента. */
  confirm(): void {
    const p = this._pendingTap;
    if (!p || !this.tool) return this.press('Enter');
    this._pendingTap = null;
    this.tool.down?.(p, this);
    this.tool.up?.(p, this);
    this.onTouchState();
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
    this._capture(e.pointerId);
    if (this._touches.size >= 2) {
      // второй палец отменяет начатое действие инструмента и включает камеру
      if (this._down) this.cancelDrag();
      this._tp = null;
      this._gesture = this._gestureState();
      this._gm = { mode: '', zoom: 0, rot: 0, tilt: 0, zoomOn: false, rotOn: false };
      this._gestureTail = true;
      return true;
    }
    this._gestureTail = false;
    return false;
  }

  /**
   * Два пальца: щипок — масштаб, разворот — вращение, оба пальца вместе вверх/вниз — наклон (вниз — вид сверху).
   * Режим выбирается по первому явному движению; в «щипке» мелкие дрожания масштаба/поворота игнорируются (мёртвая зона).
   */
  private _touchMove(e: PointerEvent): boolean {
    if (!this._touches.has(e.pointerId)) return false;
    this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._touches.size < 2) return this._gestureTail;
    const g = this._gestureState();
    const prev = this._gesture;
    if (g && prev) {
      const cam = this._renderer.camera;
      const m = this._gm;
      const dz = Math.log(g.dist / prev.dist);
      let da = g.ang - prev.ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const dy = g.cy - prev.cy;
      m.zoom += dz;
      m.rot += da;
      m.tilt += dy;
      if (!m.mode) {
        const zoomS = Math.abs(m.zoom) / 0.07;
        const rotS = Math.abs(m.rot) / 0.12;
        const tiltS = Math.abs(m.tilt) / 16;
        if (tiltS >= 1 && tiltS > zoomS && tiltS > rotS) m.mode = 'tilt';
        else if (zoomS >= 1 || rotS >= 1) m.mode = 'pinch';
      }
      if (m.mode === 'tilt') cam.rotate(0, dy * 0.006);
      else if (m.mode === 'pinch') {
        if (!m.zoomOn && Math.abs(m.zoom) > 0.05) m.zoomOn = true;
        if (!m.rotOn && Math.abs(m.rot) > 0.1) m.rotOn = true;
        if (m.zoomOn) cam.zoom(Math.exp(-dz));
        if (m.rotOn) cam.rotate(-da, 0);
      }
    }
    this._gesture = g;
    return true;
  }

  /** Один палец по карте: сдвиг камеры (после порога); true — событие обработано. */
  private _touchPan(e: PointerEvent): boolean {
    const tp = this._tp;
    if (!tp || tp.id !== e.pointerId) return false;
    if (!tp.moved && Math.hypot(e.clientX - tp.sx, e.clientY - tp.sy) > 9) tp.moved = true;
    if (tp.moved) this._renderer.camera.panPixels(e.clientX - tp.lx, e.clientY - tp.ly);
    tp.lx = e.clientX;
    tp.ly = e.clientY;
    return true;
  }

  /** Короткое касание без сдвига. */
  private _tap(e: PointerEvent): void {
    const p = this._pointer(e);
    if (!p || !this.tool || this._brushTool) return;
    if (!this._confirmTool || this.tool.touchInstant?.()) {
      this.tool.hover?.(p, this);
      this.tool.down?.(p, this);
      this.tool.up?.(p, this);
      return;
    }
    const near = this._pendingTap && Math.hypot(this._pendingScreen.x - e.clientX, this._pendingScreen.y - e.clientY) < 40;
    if (near) return this.confirm();
    this._pendingTap = p;
    this._pendingScreen = { x: e.clientX, y: e.clientY };
    this._lastP = p;
    this.tool.hover?.(p, this);
    this.onTouchState();
  }

  /** Прервать зажатый ввод без вызова up (второй палец, смена режима). */
  cancelDrag(): void {
    this._down = false;
    this._btn = -1;
    this.tool?.escape?.(this);
    this.clearPreview();
  }

  private _capture(id: number): void {
    try {
      this._canvas.setPointerCapture(id);
    } catch {
      // указатель уже отпущен — захват не нужен
    }
  }

  /** Нажатие «клавиши» с экранных кнопок. */
  press(code: string): void {
    if (this.locked) return;
    if (this.tool?.key?.(code, this)) this.game.bus.emit('tool:set', this._toolId);
  }

  /** Экранная кнопка «отмена» (аналог ПКМ / Esc). */
  cancel(): void {
    if (this._pendingTap) {
      // сначала снимаем только отложенную точку (инструмент остаётся)
      this._pendingTap = null;
      this.clearPreview();
      this.onTouchState();
      return;
    }
    this._escape();
  }

  private _onDown(e: PointerEvent): void {
    if (this.locked) return;
    if (e.pointerType === 'touch' && this._touchDown(e)) return;
    if (this._gestureTail) return;
    if (e.pointerType === 'touch' && !(this._brushTool && this.touchDraw)) {
      // палец двигает камеру; короткий тап — действие инструмента
      this._capture(e.pointerId);
      this._tp = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, t0: performance.now() };
      return;
    }
    this._capture(e.pointerId);
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
    if (e.pointerType === 'touch' && !this.locked && (this._touchMove(e) || this._touchPan(e))) return;
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
      const tp = this._tp;
      if (tp && tp.id === e.pointerId) {
        this._tp = null;
        // «чёткое» нажатие: короткое и без сдвига (длинное касание на месте — не действие)
        if (!tp.moved && !this.locked && performance.now() - tp.t0 < 450) this._tap(e);
        return;
      }
    }
    if (!this._down) return;
    this._down = false;
    const btn = this._btn;
    const touchBrush = e.pointerType === 'touch' && this._brushTool;
    this._btn = -1;
    const p = this._pointer(e) ?? this._lastP;
    if (btn === 0 && this.tool && p) {
      if (!this.tool.panOnDrag || this._moved <= 4) this.tool.up?.(p, this);
    } else if (btn === 2 && this._moved < 5) this._escape();
    // палец оторван — кисть на карте не остаётся (на ПК кольцо следует за курсором)
    if (touchBrush) {
      this.tool?.hover?.(null, this);
      this.clearPreview();
    }
  }

  /** ПКМ / Esc: отменить текущую операцию инструмента, иначе вернуться к «Выбору». */
  private _escape(fromKey = false): void {
    if (this.tool?.escape?.(this)) return;
    if (this._toolId !== 'select') this.setTool('select');
    else if (fromKey && this.onIdleEscape?.()) return;
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
    if (e.code === 'Escape') {
      // окно открыто: Esc закрывает его (UI), инструмент не трогаем
      if (this.isBlocked?.()) return;
      return this._escape(true);
    }
    if (keys.is(e, 'pause')) {
      e.preventDefault();
      g.setSpeed(g.speed === 0 ? 1 : 0);
      return;
    }
    const speeds = g.config.time.speeds;
    for (const [i, id] of ['speed1', 'speed2', 'speed3'].entries()) if (keys.is(e, id) && speeds[i + 1] !== undefined) return g.setSpeed(speeds[i + 1]);
    const toolHotkeys: Record<string, string> = { bulldoze: 'bulldoze', 'zone:none': 'dezone' };
    for (const item of g.toolbar.all()) {
      const bind = toolHotkeys[item.id];
      if (bind ? keys.is(e, bind) : item.hotkey === e.code && item.hotkey !== 'Escape') {
        this.setTool(item.id);
        return;
      }
    }
  }
}
