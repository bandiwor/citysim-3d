import type { AudioEngine } from '../audio/AudioEngine';
import type { Game } from '../core/Game';
import type { Pointer } from '../core/types';
import { onLocaleChange, setLocale, t } from '../i18n';
import type { Renderer } from '../render/Renderer';
import { Terrain } from '../world/Terrain';
import { graphics } from '../render/graphics';
import { pwa } from '../pwa';
import { h } from './dom';
import { keys } from './keybinds';
import { Clock, Hud } from './Hud';
import { RouteTool } from '../tools/MoreTools';
import { FirstPerson } from '../render/FirstPerson';
import { cityBody, routesBody } from './TransitPanel';
import { advisorList, eventBody, goalsBody, policiesBody } from './ProgressPanel';
import { Input } from './Input';
import { budgetBody, educationBody, helpBody, Inspector, Modal, statsBody } from './Panels';
import { diagnosticsBody } from './DiagnosticsPanel';
import { settingsBody } from './SettingsPanel';
import { Toolbar } from './Toolbar';

/** Сборка интерфейса поверх канваса. Пересобирается при смене языка. */
export class UI {
  readonly input: Input;
  private _modal = new Modal();
  private _toasts = h('div', { class: 'toasts' });
  private _selected = false;
  private _update = h('div', { class: 'update-banner', style: 'display:none' });
  private _toolbar: Toolbar | null = null;
  private _fps = h('div', { class: 'fps', style: 'display:none' });
  private _hint = h('div', { class: 'cursor-hint', style: 'display:none' });
  private _info = h('div', { class: 'cell-info' });
  private _mapsMenu = h('div', { class: 'panel maps-menu', style: 'display:none' });
  private _advMenu = h('div', { class: 'panel maps-menu adv-menu', style: 'display:none' });
  private _tracker = h('div', { class: 'tracker' });
  private _touchBar = h('div', { class: 'touchbar' });
  private _parts: { dispose(): void }[] = [];
  readonly fp: FirstPerson;
  private _fpBar = h('div', { class: 'fp-bar', style: 'display:none' });

  constructor(private _root: HTMLElement, private _game: Game, private _renderer: Renderer, canvas: HTMLCanvasElement, private _audio: AudioEngine, private _onExit: () => void) {
    this.input = new Input(canvas, _renderer, _game);
    this.fp = new FirstPerson(_game, _renderer, canvas, (v) => {
      this.input.locked = v;
      if (v) this.input.clearPreview();
    });
    _renderer.addView(this.fp);
    this.fp.onChange = (on) => this._fpMode(on);
    this.input.onHint = (text, x, y) => {
      this._hint.style.display = text ? 'block' : 'none';
      this._hint.textContent = text;
      this._hint.style.transform = `translate(${x + 18}px, ${y + 14}px)`;
    };
    this.input.onHover = (p) => this._hover(p);
    this.input.isBlocked = () => this._modal.isOpen;
    // Esc при «Выборе»: раздел панели → выбор здания → меню
    _game.bus.on('select', (b) => (this._selected = !!b));
    _game.bus.on('select:stop', (id) => (this._selected = !!id));
    this.input.onIdleEscape = () => {
      if (this._toolbar?.isOpen) {
        this._toolbar.close();
        return true;
      }
      if (this._selected) {
        _game.bus.emit('select', null);
        _game.bus.emit('select:stop', null);
        return true;
      }
      // меню открываем после обработчика Esc окна, иначе оно тут же закроется
      setTimeout(() => this._menu(), 0);
      return true;
    };
    this._modal.onClose = () => (this._eventOpen = false);
    _game.bus.on('message', (m) => this._toast(t(m.key, m.params), m.kind));
    _game.bus.on('event:show', () => {
      if (this._game.get('events').pending) this.openEvent();
      else if (this._eventOpen) this._modal.close();
    });
    window.setInterval(() => this._drawTracker(), 1000);
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      if (this.fp.active) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (keys.is(e, 'budget')) this.openBudget();
      if (keys.is(e, 'stats')) this.openStats();
      if (keys.is(e, 'routes')) this.openRoutes();
      if (keys.is(e, 'education')) this.openEducation();
      if (keys.is(e, 'goals')) this.openGoals();
      if (keys.is(e, 'policies')) this.openPolicies();
      if (keys.is(e, 'city')) this.openCity();
      if (keys.is(e, 'diagnostics')) this.openDiagnostics();
      if (keys.is(e, 'settings')) this.openSettings();
      if (keys.is(e, 'walk')) this.enterWalk();
      if (e.code === 'Escape' && this._modal.isOpen) this._modal.close();
    });
    _root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.btn')) _audio.sfx('tick');
    });
    // новая версия приложения скачана — предлагаем обновиться
    const syncUpdate = (): void => {
      this._update.style.display = pwa.updateReady ? 'flex' : 'none';
    };
    this._update.append(h('span', { text: `🔄 ${t('pwa.updateAvailable')}` }), h('button', { class: 'btn sm primary', text: t('pwa.applyUpdate'), onclick: () => pwa.applyUpdate() }), h('button', { class: 'btn sm', text: '✕', onclick: () => (this._update.style.display = 'none') }));
    pwa.onChange(syncUpdate);
    syncUpdate();
    // масштаб интерфейса и счётчик FPS из настроек графики
    const applyUi = (): void => {
      this._root.style.setProperty('--ui-scale', String(graphics.get().uiScale));
      this._fps.style.display = graphics.get().fps ? 'block' : 'none';
    };
    applyUi();
    graphics.onChange(applyUi);
    let frames = 0;
    let last = performance.now();
    const countFps = (): void => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        const dyn = this._renderer.dynamicScale;
        this._fps.textContent = `${Math.round((frames * 1000) / (now - last))} FPS${dyn < 1 ? ` · ${Math.round(dyn * 100)}%` : ''}`;
        frames = 0;
        last = now;
      }
      requestAnimationFrame(countFps);
    };
    requestAnimationFrame(countFps);
    onLocaleChange(() => this.build());
    this.build();
    _game.bus.on('tool:set', (id) => {
      if (id === 'select') this._toolbar?.setCollapsed(false);
      this._updateTouchBar();
    });
    this.input.setTool('select');
    _game.message('msg.welcome', undefined, 'info');
  }

  /** (Пере)создаёт все панели с текущим языком. */
  build(): void {
    for (const p of this._parts) p.dispose();
    const g = this._game;
    const hud = new Hud(g, {
      menu: () => this._menu(),
      budget: () => this.openBudget(),
      stats: () => this.openStats(),
      education: () => this.openEducation(),
      diagnostics: () => this.openDiagnostics(),
      maps: (btn) => this._toggleMaps(btn),
      routes: () => this.openRoutes(),
      city: () => this.openCity(),
      walk: () => this.enterWalk(),
      settings: () => this.openSettings(),
      help: () => this._modal.open(t('menu.help'), helpBody()),
      save: () => g.get('save').save(),
      goals: () => this.openGoals(),
      policies: () => this.openPolicies(),
      advisor: (btn) => this._toggleAdvisor(btn),
      event: () => this.openEvent(),
    });
    const clock = new Clock(g);
    const toolbar = new Toolbar(g, () => this.input.tool);
    this._toolbar = toolbar;
    const inspector = new Inspector(g);
    this._parts = [hud, toolbar, inspector, clock];
    this._fpBar.replaceChildren(
      h('div', { class: 'fp-cross' }),
      h('div', { class: 'fp-help', text: t('fp.help') }),
      h('button', { class: 'btn', text: `⏎ ${t('fp.exit')}`, onclick: () => this.fp.exit() }),
    );
    this._root.replaceChildren(hud.el, toolbar.el, inspector.el, clock.el, this._fpBar, this._toasts, this._update, this._fps, this._hint, this._info, this._mapsMenu, this._advMenu, this._tracker, this._touchBar, this._modal.el);
    this._buildTouchBar();
    this.input.onTouchState = () => this._updateTouchBar();
    this._advMenu.style.display = 'none';
    this._drawTracker();
    this._modal.close();
    this._mapsMenu.style.display = 'none';
    if (this.input.toolId) g.bus.emit('tool:set', this.input.toolId);
  }

  openBudget(): void {
    const b = budgetBody(this._game, () => this.openDiagnostics());
    this._modal.open(`💰 ${t('modal.budget')}`, b.el, () => b.tick());
  }

  private _eventOpen = false;

  private _tb: Record<string, HTMLElement> = {};

  /** Экранные кнопки для телефона: показываются по контексту (дорога, кисть, здание). Камера — жестами. */
  private _buildTouchBar(): void {
    const b = (key: string, text: string, title: string, fn: () => void): HTMLElement => {
      const el = h('button', { class: 'btn icon', text, title: t(title), onclick: fn });
      this._tb[key] = el;
      return el;
    };
    this._tb = {};
    this._touchBar.replaceChildren(
      b('hide', '👁', 'touch.hideUi', () => this._setUiHidden(!document.body.classList.contains('ui-min'))),
      b('exit', '⏏', 'touch.exit', () => {
        this.input.cancel();
        if (this.input.toolId !== 'select') this.input.setTool('select');
      }),
      b('panel', '🧰', 'touch.panel', () => this._toolbar?.setCollapsed(!this._toolbar.collapsed)),
      b('mode', '✏️', 'touch.drawMode', () => {
        this.input.touchDraw = !this.input.touchDraw;
        this._updateTouchBar();
      }),
      b('rotL', '↺', 'touch.rotateL', () => this.input.press('Comma')),
      b('rotR', '↻', 'touch.rotateR', () => this.input.press('Period')),
      b('curve', '〰', 'touch.curve', () => this.input.press(keys.code('curve'))),
      b('snap', '🧲', 'touch.snap', () => this.input.press(keys.code('snap'))),
      b('brushS', '◔', 'touch.brushSmaller', () => this.input.press('BracketLeft')),
      b('brushB', '◕', 'touch.brushBigger', () => this.input.press('BracketRight')),
      b('cancel', '↩', 'touch.cancel', () => this.input.cancel()),
      b('ok', '✔', 'touch.confirm', () => this.input.confirm()),
    );
    this._updateTouchBar();
  }

  private _setUiHidden(v: boolean): void {
    document.body.classList.toggle('ui-min', v);
    this._updateTouchBar();
  }

  /** Показывает только нужные в данный момент кнопки. */
  private _updateTouchBar(): void {
    const id = this.input.toolId;
    const road = id.startsWith('road:');
    const brush = id.startsWith('zone:') || id.startsWith('terraform:') || id.startsWith('prop:') || id === 'bulldoze';
    const place = id.startsWith('service:');
    const active = !!id && id !== 'select';
    const show = (k: string, on: boolean): void => {
      if (this._tb[k]) this._tb[k].style.display = on ? '' : 'none';
    };
    show('hide', !active || document.body.classList.contains('ui-min'));
    show('exit', active);
    show('panel', active && !!this._toolbar);
    show('mode', brush);
    show('rotL', place);
    show('rotR', place);
    show('curve', road);
    show('snap', road);
    show('brushS', brush);
    show('brushB', brush);
    show('cancel', active);
    show('ok', active && !brush);
    this._tb.ok?.classList.toggle('ready', this.input.hasPending);
    this._tb.mode?.classList.toggle('on', !this.input.touchDraw);
    if (this._tb.mode) this._tb.mode.textContent = this.input.touchDraw ? '✏️' : '✋';
    this._tb.hide?.classList.toggle('on', document.body.classList.contains('ui-min'));
    document.body.classList.toggle('tool-on', active);
  }

  openGoals(): void {
    const b = goalsBody(this._game);
    this._eventOpen = false;
    this._modal.open(`🎯 ${t('modal.goals')}`, b.el, () => b.tick());
  }

  openPolicies(): void {
    const b = policiesBody(this._game);
    this._eventOpen = false;
    this._modal.open(`📜 ${t('modal.policies')}`, b.el, () => b.tick());
  }

  openEvent(): void {
    const p = this._game.get('events').pending;
    const d = p && this._game.get('events').def(p.id);
    if (!d) return;
    this._modal.open(`${d.icon} ${t(`event.${d.id}.title`)}`, eventBody(this._game, () => this._modal.close()));
    this._eventOpen = true;
  }

  /** Выпадающее меню под кнопкой: прижато к левому или правому краю кнопки, но не выходит за экран. */
  private _placeMenu(m: HTMLElement, r: DOMRect): void {
    m.style.top = `${r.bottom + 6}px`;
    m.style.maxHeight = `${Math.max(120, window.innerHeight - r.bottom - 16)}px`;
    m.style.left = 'auto';
    m.style.right = 'auto';
    if (r.left + r.width / 2 < window.innerWidth / 2) m.style.left = `${Math.max(8, r.left)}px`;
    else m.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  }

  private _toggleAdvisor(btn: HTMLElement): void {
    const m = this._advMenu;
    if (m.style.display !== 'none') {
      m.style.display = 'none';
      return;
    }
    this._game.get('advisor').refresh();
    const r = btn.getBoundingClientRect();
    m.style.display = 'flex';
    this._placeMenu(m, r);
    m.replaceChildren(
      h('div', { class: 'panel-head' }, h('span', { text: `🔔 ${t('hud.advisor')}` })),
      ...advisorList(this._game, (x, z) => this._renderer.camera.focus(x, z), () => (m.style.display = 'none')),
    );
  }

  /** Компактный список активных целей на экране. */
  private _drawTracker(): void {
    const ob = this._game.get('objectives');
    if (this.fp.active) {
      this._tracker.style.display = 'none';
      return;
    }
    this._tracker.style.display = ob.active.length ? 'flex' : 'none';
    this._tracker.replaceChildren(
      h('div', { class: 'tr-head', text: `🎯 ${t('modal.goals')}`, onclick: () => this.openGoals() }),
      ...ob.active.map((o) => {
        const d = ob.describe(o);
        return h('div', { class: 'tr-row', title: `${d.value} / ${d.target}` }, h('span', { text: d.text }), h('div', { class: 'tr-bar' }, h('div', { class: 'tr-fill', style: `width:${Math.round(ob.fraction(o) * 100)}%` })));
      }),
    );
  }

  openRoutes(): void {
    const tr = this._game.get('transit');
    const r = routesBody(this._game, {
      create: () => {
        this._modal.close();
        this.input.setTool('route');
      },
      edit: (id) => {
        this._modal.close();
        this.input.setTool('route');
        (this.input.tool as RouteTool).setRoute(id);
        tr.showRoutes = true;
        this._renderer.routes.setFocus(id);
      },
      track: (id) => {
        const bus = tr.busOf(id);
        if (!bus) return this._game.message('msg.noBus', undefined, 'warn');
        this._modal.close();
        this._renderer.camera.follow(() => {
          const v = tr.busOf(id);
          return v ? { x: v.x, z: v.z } : null;
        });
        this._renderer.camera.distance = Math.min(this._renderer.camera.distance, 90);
      },
      focus: (id) => this._renderer.routes.setFocus(id),
    });
    this._modal.open(`🚌 ${t('modal.routes')}`, r.el, () => r.tick());
  }

  openCity(): void {
    const c = cityBody(this._game);
    this._modal.open(`🏙️ ${t('modal.city')}`, c.el, () => c.tick());
  }

  enterWalk(): void {
    const tgt = this._renderer.camera.target;
    this._modal.close();
    this._game.bus.emit('fp:enter', { x: tgt.x, z: tgt.z });
  }

  private _fpMode(on: boolean): void {
    this._root.classList.toggle('fp-mode', on);
    this._fpBar.style.display = on ? 'flex' : 'none';
    if (on) this._game.bus.emit('select', null);
  }

  openDiagnostics(): void {
    const s = diagnosticsBody(this._game, (x, z) => { this._modal.close(); this._renderer.camera.focus(x, z); }, { budget: () => this.openBudget(), stats: () => this.openStats() });
    this._modal.open(`🔍 ${t('modal.diagnostics')}`, s.el, () => s.tick());
  }

  openSettings(): void {
    this._modal.open(`⚙️ ${t('menu.settings')}`, settingsBody({ game: this._game, audio: this._audio, onLocale: (l) => setLocale(l) }));
  }

  openEducation(): void {
    const s = educationBody(this._game);
    this._modal.open(`🎓 ${t('modal.education')}`, s.el, () => s.tick());
  }

  openStats(): void {
    const s = statsBody(this._game);
    this._modal.open(`📊 ${t('modal.stats')}`, s.el, () => s.tick());
  }

  private _menu(): void {
    const g = this._game;
    const box = h(
      'div',
      { class: 'menu' },
      h('button', { class: 'btn wide', text: `💾 ${t('menu.save')}`, onclick: () => g.get('save').save() }),
      h('button', { class: 'btn wide', text: `⚙️ ${t('menu.settings')}`, onclick: () => this._modal.open(t('menu.settings'), settingsBody({ game: g, audio: this._audio, onLocale: (l) => setLocale(l) })) }),
      h('button', { class: 'btn wide', text: `❓ ${t('menu.help')}`, onclick: () => this._modal.open(t('menu.help'), helpBody()) }),
      h('button', { class: 'btn wide danger', text: `🏠 ${t('menu.exit')}`, onclick: () => { g.get('save').save(true); this._onExit(); } }),
    );
    this._modal.open(t('menu.title'), box);
  }

  private _toggleMaps(btn: HTMLElement): void {
    const m = this._mapsMenu;
    if (m.style.display !== 'none') {
      m.style.display = 'none';
      return;
    }
    const r = btn.getBoundingClientRect();
    m.style.display = 'flex';
    this._placeMenu(m, r);
    m.replaceChildren(
      h('button', { class: 'btn wide', text: `✖ ${t('maps.off')}`, onclick: () => { this._game.bus.emit('overlay:set', null); m.style.display = 'none'; } }),
      ...this._game.overlays.all().map((o) => h('button', { class: 'btn wide', text: `${o.icon} ${t(`overlay.${o.id}.name`)}`, onclick: () => { this._game.bus.emit('overlay:set', o.id); m.style.display = 'none'; } })),
    );
  }

  private _toast(text: string, kind: string): void {
    // одинаковые сообщения подряд склеиваются в счётчик ×N
    const last = this._toasts.lastElementChild as (HTMLElement & { _n?: number; _t?: number; _o?: number }) | null;
    if (last && last.dataset.text === text && !last.classList.contains('out')) {
      last._n = (last._n ?? 1) + 1;
      last.textContent = `${text}  ×${last._n}`;
      clearTimeout(last._t);
      clearTimeout(last._o);
      this._schedule(last);
      return;
    }
    const el = h('div', { class: `toast ${kind}`, text, title: t('toast.dismiss') }) as HTMLElement & { _t?: number; _o?: number };
    el.dataset.text = text;
    el.addEventListener('click', () => el.remove());
    this._toasts.append(el);
    while (this._toasts.children.length > 5) this._toasts.firstElementChild?.remove();
    this._schedule(el);
  }

  private _schedule(el: HTMLElement & { _t?: number; _o?: number }): void {
    el.classList.remove('out');
    el._t = window.setTimeout(() => el.classList.add('out'), 4500);
    el._o = window.setTimeout(() => el.remove(), 5100);
  }

  private _hover(p: Pointer | null): void {
    if (!p) {
      this._info.textContent = '';
      return;
    }
    const g = this._game;
    const w = g.world;
    const parts: string[] = [`(${Math.round(p.x)}, ${Math.round(p.z)})`];
    const road = w.graph.nearest(p.x, p.z, 12);
    const terrain = w.terrainAt(p.x, p.z);
    if (road && road.d <= road.edge.hw) parts.push(t(`road.${g.roadTypes.at(road.edge.type).id}.name`) + (road.edge.bridge ? ` (${t('hover.bridge')})` : ''));
    else if (terrain === Terrain.Water) parts.push(t('hover.water'));
    else if (terrain === Terrain.Blocked) parts.push(t('hover.hills'));
    else {
      const cell = w.zones.near(p.x, p.z, 4.5)[0];
      if (cell?.zone) parts.push(`${t('hover.zone')}: ${t(`zone.${g.zoneTypes.at(cell.zone - 1).id}.name`)}`);
    }
    const b = w.buildingAt(p.x, p.z);
    if (b) parts.push(b.kind === 'zone' ? `${t(`density.${b.zone}.${b.level - 1}.name`)} ${'★'.repeat(b.wealth)}` : t(`service.${b.defId}.name`));
    this._info.textContent = parts.join(' · ');
  }
}
