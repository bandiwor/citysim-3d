import type { Game } from '../core/Game';
import { h, fmt } from './dom';

/** Нижняя панель: категории → инструменты (строится по реестру game.toolbar). */
export class Toolbar {
  readonly el: HTMLElement;
  private _items = h('div', { class: 'tb-items' });
  private _cats = h('div', { class: 'tb-cats' });
  private _open = '';
  private _catBtns = new Map<string, HTMLElement>();
  private _itemBtns = new Map<string, HTMLElement>();

  constructor(private _game: Game) {
    for (const c of _game.categories) {
      const b = h('button', { class: 'btn cat', title: c.name, onclick: () => this._toggle(c.id) }, h('span', { class: 'ic', text: c.icon }), h('span', { class: 'lb', text: c.name }));
      this._catBtns.set(c.id, b);
      this._cats.append(b);
    }
    this.el = h('div', { class: 'toolbar' }, this._items, this._cats);
    _game.bus.on('tool:set', (id) => this._highlight(id));
    _game.bus.on('economy:changed', () => this._affordable());
    this._affordable();
    this._toggle('roads');
  }

  private _toggle(id: string): void {
    this._open = this._open === id ? '' : id;
    this._items.replaceChildren();
    this._itemBtns.clear();
    this._items.style.display = this._open ? 'flex' : 'none';
    for (const [cid, b] of this._catBtns) b.classList.toggle('active', cid === this._open);
    if (!this._open) return;
    for (const it of this._game.toolbar.all().filter((i) => i.category === this._open)) {
      const b = h(
        'button',
        { class: 'btn item', title: it.desc ?? it.name, onclick: () => this._game.bus.emit('tool:request', it.id) },
        h('span', { class: 'ic', text: it.icon }),
        h('span', { class: 'nm', text: it.name }),
        it.cost ? h('span', { class: 'cost', text: `₽${fmt(it.cost)}` }) : null,
      );
      this._itemBtns.set(it.id, b);
      this._items.append(b);
    }
    this._affordable();
  }

  private _highlight(id: string): void {
    for (const [iid, b] of this._itemBtns) b.classList.toggle('active', iid === id);
    const item = this._game.toolbar.get(id);
    if (item && item.category !== this._open && id !== 'select') this._toggle(item.category);
    for (const [iid, b] of this._itemBtns) b.classList.toggle('active', iid === id);
  }

  private _affordable(): void {
    const money = this._game.get('economy').money;
    for (const [id, b] of this._itemBtns) {
      const it = this._game.toolbar.get(id);
      b.classList.toggle('poor', !!it?.cost && it.cost > money);
    }
  }
}
