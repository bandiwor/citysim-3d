import type { AudioEngine } from '../audio/AudioEngine';
import type { Game } from '../core/Game';
import type { Pointer } from '../core/types';
import { onLocaleChange, setLocale, t } from '../i18n';
import type { Renderer } from '../render/Renderer';
import { Terrain } from '../world/Terrain';
import { h } from './dom';
import { Clock, Hud } from './Hud';
import { RouteTool } from '../tools/MoreTools';
import { FirstPerson } from '../render/FirstPerson';
import { cityBody, routesBody } from './TransitPanel';
import { advisorList, eventBody, goalsBody, policiesBody } from './ProgressPanel';
import { Input } from './Input';
import { budgetBody, helpBody, Inspector, Modal, settingsBody, statsBody } from './Panels';
import { Toolbar } from './Toolbar';

/** Сборка интерфейса поверх канваса. Пересобирается при смене языка. */
export class UI {
  readonly input: Input;
  private _modal = new Modal();
  private _toasts = h('div', { class: 'toasts' });
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
      if (e.code === 'KeyB') this.openBudget();
      if (this.fp.active) return;
      if (e.code === 'KeyG' && !e.ctrlKey) this.openStats();
      if (e.code === 'KeyT') this.openRoutes();
      if (e.code === 'KeyJ') this.openGoals();
      if (e.code === 'KeyK') this.openPolicies();
      if (e.code === 'KeyH') this.openCity();
      if (e.code === 'KeyP') this.enterWalk();
      if (e.code === 'Escape' && this._modal.isOpen) this._modal.close();
    });
    _root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.btn')) _audio.sfx('tick');
    });
    onLocaleChange(() => this.build());
    this.build();
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
      maps: (btn) => this._toggleMaps(btn),
      routes: () => this.openRoutes(),
      city: () => this.openCity(),
      walk: () => this.enterWalk(),
      settings: () => this._modal.open(t('menu.settings'), settingsBody({ game: g, renderer: this._renderer, audio: this._audio, onLocale: (l) => setLocale(l) })),
      help: () => this._modal.open(t('menu.help'), helpBody()),
      save: () => g.get('save').save(),
      goals: () => this.openGoals(),
      policies: () => this.openPolicies(),
      advisor: (btn) => this._toggleAdvisor(btn),
      event: () => this.openEvent(),
    });
    const clock = new Clock(g);
    const toolbar = new Toolbar(g, () => this.input.tool);
    const inspector = new Inspector(g);
    this._parts = [hud, toolbar, inspector, clock];
    this._fpBar.replaceChildren(
      h('div', { class: 'fp-cross' }),
      h('div', { class: 'fp-help', text: t('fp.help') }),
      h('button', { class: 'btn', text: `⏎ ${t('fp.exit')}`, onclick: () => this.fp.exit() }),
    );
    this._root.replaceChildren(hud.el, toolbar.el, inspector.el, clock.el, this._fpBar, this._toasts, this._hint, this._info, this._mapsMenu, this._advMenu, this._tracker, this._touchBar, this._modal.el);
    this._buildTouchBar();
    this._advMenu.style.display = 'none';
    this._drawTracker();
    this._modal.close();
    this._mapsMenu.style.display = 'none';
    if (this.input.toolId) g.bus.emit('tool:set', this.input.toolId);
  }

  openBudget(): void {
    const b = budgetBody(this._game);
    this._modal.open(`💰 ${t('modal.budget')}`, b.el, () => b.tick());
  }

  private _eventOpen = false;

  /** Экранные кнопки для телефона: вместо Esc/ПКМ, Enter, поворота здания, режима кривой, кисти и наклона камеры. */
  private _buildTouchBar(): void {
    const cam = this._renderer.camera;
    const b = (text: string, title: string, fn: () => void): HTMLElement => h('button', { class: 'btn icon', text, title: t(title), onclick: fn });
    this._touchBar.replaceChildren(
      b('✖', 'touch.cancel', () => this.input.cancel()),
      b('✔', 'touch.confirm', () => this.input.press('Enter')),
      b('↺', 'touch.rotateL', () => this.input.press('Comma')),
      b('↻', 'touch.rotateR', () => this.input.press('Period')),
      b('〰', 'touch.curve', () => this.input.press('KeyC')),
      b('🧲', 'touch.snap', () => this.input.press('KeyV')),
      b('◔', 'touch.brushSmaller', () => this.input.press('BracketLeft')),
      b('◕', 'touch.brushBigger', () => this.input.press('BracketRight')),
      b('⤴', 'touch.tiltUp', () => cam.rotate(0, 0.18)),
      b('⤵', 'touch.tiltDown', () => cam.rotate(0, -0.18)),
    );
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
      h('button', { class: 'btn wide', text: `⚙️ ${t('menu.settings')}`, onclick: () => this._modal.open(t('menu.settings'), settingsBody({ game: g, renderer: this._renderer, audio: this._audio, onLocale: (l) => setLocale(l) })) }),
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
    const el = h('div', { class: `toast ${kind}`, text });
    this._toasts.append(el);
    while (this._toasts.children.length > 5) this._toasts.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
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
    if (b) parts.push(b.kind === 'zone' ? `${t(`zone.${b.zone}.name`)} ${t('inspector.level', { n: b.level })}` : t(`service.${b.defId}.name`));
    this._info.textContent = parts.join(' · ');
  }
}
