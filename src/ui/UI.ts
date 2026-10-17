import type { AudioEngine } from '../audio/AudioEngine';
import type { Game } from '../core/Game';
import type { Pointer } from '../core/types';
import { onLocaleChange, setLocale, t } from '../i18n';
import type { Renderer } from '../render/Renderer';
import { Terrain } from '../world/Terrain';
import { h } from './dom';
import { Hud } from './Hud';
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
  private _parts: { dispose(): void }[] = [];

  constructor(private _root: HTMLElement, private _game: Game, private _renderer: Renderer, canvas: HTMLCanvasElement, private _audio: AudioEngine, private _onExit: () => void) {
    this.input = new Input(canvas, _renderer, _game);
    this.input.onHint = (text, x, y) => {
      this._hint.style.display = text ? 'block' : 'none';
      this._hint.textContent = text;
      this._hint.style.transform = `translate(${x + 18}px, ${y + 14}px)`;
    };
    this.input.onHover = (p) => this._hover(p);
    _game.bus.on('message', (m) => this._toast(t(m.key, m.params), m.kind));
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      if (e.code === 'KeyB') this.openBudget();
      if (e.code === 'KeyG' && !e.ctrlKey) this.openStats();
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
    const hud = new Hud(g, { menu: () => this._menu(), budget: () => this.openBudget(), stats: () => this.openStats(), maps: (btn) => this._toggleMaps(btn) });
    const toolbar = new Toolbar(g, () => this.input.tool);
    const inspector = new Inspector(g);
    this._parts = [hud, toolbar, inspector];
    this._root.replaceChildren(hud.el, toolbar.el, inspector.el, this._toasts, this._hint, this._info, this._mapsMenu, this._modal.el);
    this._modal.close();
    this._mapsMenu.style.display = 'none';
    if (this.input.toolId) g.bus.emit('tool:set', this.input.toolId);
  }

  openBudget(): void {
    const b = budgetBody(this._game);
    this._modal.open(`💰 ${t('modal.budget')}`, b.el, () => b.tick());
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
    m.style.top = `${r.bottom + 6}px`;
    m.style.right = `${window.innerWidth - r.right}px`;
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
