import type { Game } from '../core/Game';
import type { Cell } from '../core/types';
import type { Renderer } from '../render/Renderer';
import { Terrain } from '../world/World';
import { h } from './dom';
import { Hud } from './Hud';
import { Input } from './Input';
import { budgetBody, helpBody, Inspector, Modal, statsBody } from './Panels';
import { Toolbar } from './Toolbar';

/** Сборка интерфейса поверх канваса. */
export class UI {
  readonly input: Input;
  private _modal = new Modal();
  private _toasts = h('div', { class: 'toasts' });
  private _hint = h('div', { class: 'cursor-hint', style: 'display:none' });
  private _info = h('div', { class: 'cell-info' });
  private _mapsMenu = h('div', { class: 'panel maps-menu', style: 'display:none' });

  constructor(root: HTMLElement, private _game: Game, private _renderer: Renderer, canvas: HTMLCanvasElement, onExit: () => void) {
    this.input = new Input(canvas, _renderer, _game);
    const hud = new Hud(_game, {
      menu: () => this._menu(onExit),
      budget: () => this.openBudget(),
      stats: () => this.openStats(),
      maps: (btn) => this._toggleMaps(btn),
    });
    const toolbar = new Toolbar(_game);
    const inspector = new Inspector(_game);
    root.append(hud.el, toolbar.el, inspector.el, this._toasts, this._hint, this._info, this._mapsMenu, this._modal.el);

    this.input.onHint = (text, x, y) => {
      this._hint.style.display = text ? 'block' : 'none';
      this._hint.textContent = text;
      this._hint.style.transform = `translate(${x + 18}px, ${y + 14}px)`;
    };
    this.input.onHover = (c) => this._hover(c);
    _game.bus.on('message', (m) => this._toast(m.text, m.kind));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyB') this.openBudget();
      if (e.code === 'KeyG' && !e.ctrlKey) this.openStats();
      if (e.code === 'Escape' && this._modal.isOpen) this._modal.close();
    });
    this.input.setTool('select');
    _game.message('Добро пожаловать! Начните с дороги и электростанции.', 'info');
  }

  openBudget(): void {
    const b = budgetBody(this._game);
    this._modal.open('💰 Бюджет', b.el, () => b.tick());
  }

  openStats(): void {
    const s = statsBody(this._game);
    this._modal.open('📊 Статистика города', s.el, () => s.tick());
  }

  private _menu(onExit: () => void): void {
    const g = this._game;
    const r = this._renderer;
    const toggle = (label: string, get: () => boolean, set: (v: boolean) => void): HTMLElement => {
      const b = h('button', { class: 'btn wide', onclick: () => { set(!get()); b.textContent = `${label}: ${get() ? 'вкл' : 'выкл'}`; } });
      b.textContent = `${label}: ${get() ? 'вкл' : 'выкл'}`;
      return b;
    };
    const box = h(
      'div',
      { class: 'menu' },
      h('button', { class: 'btn wide', text: '💾 Сохранить игру', onclick: () => g.get('save').save() }),
      toggle('Тени', () => r.shadows, (v) => r.setShadows(v)),
      toggle('Смена дня и ночи', () => r.dayNight, (v) => (r.dayNight = v)),
      toggle('Пожары', () => g.get('disaster').enabled, (v) => (g.get('disaster').enabled = v)),
      h('button', { class: 'btn wide', text: '❓ Помощь', onclick: () => this._modal.open('Помощь', helpBody()) }),
      h('button', { class: 'btn wide danger', text: '🏠 В главное меню', onclick: () => { g.get('save').save(true); onExit(); } }),
    );
    this._modal.open('Меню', box);
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
      h('button', { class: 'btn wide', text: '✖ Выключить карту', onclick: () => { this._game.bus.emit('overlay:set', null); m.style.display = 'none'; } }),
      ...this._game.overlays.all().map((o) =>
        h('button', { class: 'btn wide', text: `${o.icon} ${o.name}`, onclick: () => { this._game.bus.emit('overlay:set', o.id); m.style.display = 'none'; } }),
      ),
    );
  }

  private _toast(text: string, kind: string): void {
    const t = h('div', { class: `toast ${kind}`, text });
    this._toasts.append(t);
    while (this._toasts.children.length > 5) this._toasts.firstElementChild?.remove();
    setTimeout(() => t.classList.add('out'), 4200);
    setTimeout(() => t.remove(), 4800);
  }

  private _hover(c: Cell | null): void {
    if (!c) {
      this._info.textContent = '';
      return;
    }
    const g = this._game;
    const w = g.world;
    const i = w.idx(c.x, c.y);
    const parts: string[] = [`(${c.x}, ${c.y})`];
    if (w.road[i]) parts.push(g.roadTypes.at(w.road[i] - 1).name + (w.terrain[i] === Terrain.Water ? ' (мост)' : ''));
    else if (w.terrain[i] === Terrain.Water) parts.push('Вода (только мосты)');
    else if (w.terrain[i] === Terrain.Blocked) parts.push('Холмы');
    else if (w.zone[i]) parts.push(`Зона: ${g.zoneTypes.at(w.zone[i] - 1).name}`);
    const b = w.buildingAt(c.x, c.y);
    if (b) parts.push(b.kind === 'zone' ? `${g.zoneTypes.require(b.zone).name} ур.${b.level}` : g.services.require(b.defId).name);
    this._info.textContent = parts.join(' · ');
  }
}

