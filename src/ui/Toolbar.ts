import type { Game } from '../core/Game';
import type { Tool } from '../core/Tool';
import { fmtNumber, t } from '../i18n';
import { h } from './dom';

/** Нижняя панель: категории → инструменты (строится по реестру game.toolbar) + опции активного инструмента. */
export class Toolbar {
  readonly el: HTMLElement;
  private _items = h('div', { class: 'tb-items' });
  private _options = h('div', { class: 'tb-options' });
  private _cats = h('div', { class: 'tb-cats' });
  private _open = '';
  private _catBtns = new Map<string, HTMLElement>();
  private _itemBtns = new Map<string, HTMLElement>();
  private _offs: (() => void)[] = [];
  private _tip = h('div', { class: 'tb-tip', style: 'display:none' });

  constructor(private _game: Game, private _getTool: () => Tool | null) {
    for (const c of _game.categories) {
      const b = h('button', { class: 'btn cat', title: t(`category.${c.id}.name`), onclick: () => this._toggle(c.id) }, h('span', { class: 'ic', text: c.icon }), h('span', { class: 'lb', text: t(`category.${c.id}.name`) }));
      this._catBtns.set(c.id, b);
      this._cats.append(b);
    }
    for (const row of [this._items, this._cats, this._options]) {
      // перетаскивание ряда мышью/пером (палец листает сам: touch-action: pan-x)
      let startX = 0;
      let startLeft = 0;
      let dragging = false;
      let moved = false;
      row.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch' || e.button !== 0) return;
        startX = e.clientX;
        startLeft = row.scrollLeft;
        dragging = true;
        moved = false;
      });
      window.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        if (!moved && Math.abs(dx) > 5) {
          moved = true;
          row.classList.add('dragging');
        }
        if (moved) row.scrollLeft = startLeft - dx;
      });
      const end = (): void => {
        if (!dragging) return;
        dragging = false;
        row.classList.remove('dragging');
        // клик, которым закончилось перетаскивание, не должен нажимать кнопку
        if (moved) setTimeout(() => (moved = false), 0);
      };
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      row.addEventListener('click', (e) => {
        if (moved) {
          e.stopPropagation();
          e.preventDefault();
        }
      }, true);
      // вертикальное колесо мыши листает ряд по горизонтали
      row.addEventListener('wheel', (e) => {
        if (row.scrollWidth <= row.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        row.scrollLeft += e.deltaY;
        e.preventDefault();
        e.stopPropagation();
      }, { passive: false });
    }
    this.el = h('div', { class: 'toolbar' }, this._tip, this._options, this._items, this._cats);
    this._offs.push(
      _game.bus.on('tool:set', (id) => this._highlight(id)),
      _game.bus.on('economy:changed', () => this._affordable()),
      _game.bus.on('tool:unlocked', () => this._relock()),
      _game.bus.on('progress:level', () => this._relock()),
    );
    this._affordable();
    this._toggle('roads');
    this._renderOptions();
  }

  /** Открыт ли раздел с инструментами. */
  get isOpen(): boolean {
    return this._open !== '';
  }

  /** Закрывает раздел (и сбрасывает его инструмент). */
  close(): void {
    if (this._open) this._toggle(this._open);
  }

  dispose(): void {
    for (const f of this._offs) f();
  }

  private _toggle(id: string): void {
    if (this._open === id) {
      // закрытие раздела отменяет инструмент из него: кисть/подсветка не остаются висеть
      const cur = this._getTool()?.id;
      const item = cur ? this._game.toolbar.get(cur) : undefined;
      if (item && item.category === id) this._game.bus.emit('tool:request', 'select');
    }
    this._open = this._open === id ? '' : id;
    this._items.replaceChildren();
    this._itemBtns.clear();
    this._items.style.display = this._open ? 'flex' : 'none';
    for (const [cid, b] of this._catBtns) b.classList.toggle('active', cid === this._open);
    if (!this._open) return;
    for (const it of this._game.toolbar.all().filter((i) => i.category === this._open)) {
      const b = h(
        'button',
        { class: 'btn item', title: it.descKey ? t(it.descKey) : t(it.nameKey), onclick: () => this._game.bus.emit('tool:request', it.id) },
        h('span', { class: 'ic', text: it.icon }),
        h('span', { class: 'nm', text: t(it.nameKey) }),
        it.cost ? h('span', { class: 'cost', text: `${t('unit.money')}${fmtNumber(it.cost)}` }) : null,
        h('span', { class: 'lock', text: '' }),
      );
      b.addEventListener('pointerenter', (e) => { if ((e as PointerEvent).pointerType !== 'touch') this._showTip(it.id, b); });
      b.addEventListener('pointerleave', () => (this._tip.style.display = 'none'));
      this._itemBtns.set(it.id, b);
      this._items.append(b);
      this._lockState(it.id, b);
    }
    this._affordable();
    this._markActive(this._getTool()?.id ?? '');
  }

  /** Подсказка над панелью: название, описание, цена и характеристики здания. */
  private _showTip(id: string, anchor: HTMLElement): void {
    const g = this._game;
    const it = g.toolbar.get(id);
    if (!it) return;
    const rows: [string, string][] = [];
    const m = /^service:(.+)$/.exec(id);
    const def = m ? g.services.get(m[1]) : undefined;
    if (it.cost) rows.push([t('tip.cost'), `${t('unit.money')}${fmtNumber(it.cost)}`]);
    if (def) {
      rows.push([t('tip.size'), `${def.size[0]}×${def.size[1]}`]);
      rows.push([t('tip.upkeep'), `${t('unit.money')}${fmtNumber(def.upkeep)}${t('unit.perMonth')}`]);
      if (def.jobs) rows.push([t('tip.jobs'), fmtNumber(def.jobs)]);
      if (def.provides?.power) rows.push([t('tip.power'), `+${fmtNumber(def.provides.power)}`]);
      if (def.provides?.water) rows.push([t('tip.water'), `+${fmtNumber(def.provides.water)}`]);
      if (def.powerNeed) rows.push([t('tip.needPower'), fmtNumber(def.powerNeed)]);
      if (def.waterNeed) rows.push([t('tip.needWater'), fmtNumber(def.waterNeed)]);
      if (def.coverage) rows.push([t('tip.radius'), `${def.coverage.radius} ${t('unit.cells')}`]);
      if (def.pollution) rows.push([t('tip.pollution'), `${Math.round(def.pollution.strength * 100)}%`]);
      if (def.upgrades?.length) rows.push([t('tip.upgrades'), String(def.upgrades.length)]);
    }
    const r = anchor.getBoundingClientRect();
    const host = this.el.getBoundingClientRect();
    const parts: HTMLElement[] = [h('div', { class: 'tip-h' }, h('span', { class: 'tip-ic', text: it.icon }), h('b', { text: t(it.nameKey) }))];
    if (it.descKey) parts.push(h('div', { class: 'tip-d', text: t(it.descKey) }));
    for (const [k, v] of rows) parts.push(h('div', { class: 'tip-r' }, h('span', { text: k }), h('span', { text: v })));
    if (it.hotkey && it.hotkey !== 'Escape') parts.push(h('div', { class: 'tip-d dim', text: `${t('tip.hotkey')}: ${it.hotkey.replace(/^Key/, '')}` }));
    this._tip.replaceChildren(...parts);
    this._tip.style.display = 'block';
    const w = this._tip.offsetWidth;
    const left = Math.min(Math.max(4, r.left + r.width / 2 - host.left - w / 2), Math.max(4, host.width - w - 4));
    this._tip.style.left = `${left}px`;
  }

  /** Замок на кнопке: показывает, при каком населении откроется. */
  private _lockState(id: string, b: HTMLElement): void {
    const pr = this._game.get('progress');
    const key = pr.toolKey(id);
    const locked = !pr.isUnlocked(key);
    b.classList.toggle('locked', locked);
    const lock = b.querySelector('.lock');
    if (lock) lock.textContent = locked ? `🔒 ${fmtNumber(pr.unlockPop(key))} ${t('unit.people')}` : '';
    const it = this._game.toolbar.get(id);
    if (it) b.title = locked ? t('hint.locked', { n: fmtNumber(pr.unlockPop(key)) }) : it.descKey ? t(it.descKey) : t(it.nameKey);
  }

  private _relock(): void {
    for (const [id, b] of this._itemBtns) this._lockState(id, b);
  }

  private _markActive(id: string): void {
    for (const [iid, b] of this._itemBtns) b.classList.toggle('active', iid === id);
  }

  /** Инструмент сменился (кнопка, горячая клавиша): открыть его категорию и подсветить кнопку. */
  private _highlight(id: string): void {
    const item = this._game.toolbar.get(id);
    if (item && item.category !== this._open && id !== 'select') this._toggle(item.category);
    this._markActive(id);
    this._renderOptions();
  }

  private _renderOptions(): void {
    const tool = this._getTool();
    this._options.replaceChildren();
    const opts = tool?.options ?? [];
    this._options.style.display = opts.length ? 'flex' : 'none';
    for (const o of opts) {
      const row = h('div', { class: 'opt' }, h('span', { class: 'opt-l', text: t(o.labelKey) }));
      for (const c of o.choices) {
        const b = h('button', {
          class: `btn sm${o.get() === c.id ? ' active' : ''}`,
          text: t(c.labelKey),
          onclick: () => {
            o.set(c.id);
            this._renderOptions();
          },
        });
        row.append(b);
      }
      this._options.append(row);
    }
  }

  private _affordable(): void {
    const money = this._game.get('economy').money;
    for (const [id, b] of this._itemBtns) {
      const it = this._game.toolbar.get(id);
      b.classList.toggle('poor', !!it?.cost && it.cost > money);
    }
  }
}
