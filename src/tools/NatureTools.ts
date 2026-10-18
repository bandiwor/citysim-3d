import type { Game } from '../core/Game';
import type { Tool, ToolContext, ToolOption } from '../core/Tool';
import type { Pointer } from '../core/types';
import { PROPS } from '../data/props';
import { fmtMoney, t } from '../i18n';

export type NatureMode = 'single' | 'brush' | 'erase';

/** «Лес» — смесь деревьев и кустов. */
const MIX = ['oak', 'pine', 'birch', 'bush', 'bush', 'flowers'];
const COLORS: Record<NatureMode, number> = { single: 0x6fd36f, brush: 0x4cc46a, erase: 0xff4d4d };

/**
 * Посадка природы: одно растение кликом, кисть с размером и густотой (можно вести мышью), ластик.
 * Растения можно выбирать по виду либо брать смесь «лес».
 */
export class NatureTool implements Tool {
  readonly id: string;
  readonly showGrid = false;
  readonly options: ToolOption[];
  private _kind = 'oak';
  private _size: number;
  private _density = 2;
  private _down = false;
  private _stamp: { x: number; z: number } | null = null;
  private _last: Pointer | null = null;

  constructor(private _game: Game, private _mode: NatureMode) {
    this.id = `prop:${_mode}`;
    this._size = _game.config.nature.defaultBrush;
    const opts: ToolOption[] = [];
    if (_mode !== 'erase') {
      opts.push({
        id: 'kind',
        labelKey: 'opt.plant',
        choices: [...PROPS.map((d) => ({ id: d.id, labelKey: `prop.${d.id}.name` })), ...(_mode === 'brush' ? [{ id: 'mix', labelKey: 'prop.mix.name' }] : [])],
        get: () => this._kind,
        set: (id) => (this._kind = id),
      });
    }
    if (_mode !== 'single') {
      opts.push({
        id: 'size',
        labelKey: 'opt.brush',
        choices: _game.config.nature.brushSizes.map((_, i) => ({ id: String(i), labelKey: `opt.brush.${i}` })),
        get: () => String(this._size),
        set: (id) => (this._size = Number(id)),
      });
    }
    if (_mode === 'brush') {
      opts.push({
        id: 'density',
        labelKey: 'opt.density.plants',
        choices: [1, 2, 3].map((n) => ({ id: String(n), labelKey: `opt.plants.${n}` })),
        get: () => String(this._density),
        set: (id) => (this._density = Number(id)),
      });
    }
    this.options = opts;
  }

  private get _radius(): number {
    return this._game.config.nature.brushSizes[this._size];
  }

  private get _kinds(): string[] {
    return this._kind === 'mix' ? MIX : [this._kind];
  }

  private _unit(): number {
    const kinds = this._kinds;
    return kinds.reduce((s, k) => s + (PROPS.find((d) => d.id === k)?.cost ?? 0), 0) / kinds.length;
  }

  hover(p: Pointer | null, ctx: ToolContext): void {
    if (!p) {
      this._down = false;
      return ctx.clearPreview();
    }
    this._last = p;
    const props = this._game.get('props');
    if (this._mode === 'single') {
      const ok = props.isFree(p.x, p.z);
      return ctx.setPreview({ quads: [], marks: [], marker: { x: p.x, z: p.z, ok }, ring: null, hint: `${fmtMoney(this._unit())}${ok ? '' : ` · ${t('hint.natureBlocked')}`}` });
    }
    const n = this._mode === 'brush' ? props.stampCount(this._radius, this._density) : 0;
    ctx.setPreview({ quads: [], marks: [], marker: null, ring: { x: p.x, z: p.z, r: this._radius, ok: true, color: COLORS[this._mode] }, hint: this._mode === 'brush' ? `~${n} · ${fmtMoney(n * this._unit())}` : t('hint.natureErase') });
  }

  down(p: Pointer, ctx: ToolContext): void {
    this._down = true;
    this._stamp = null;
    this._apply(p, ctx);
  }

  move(p: Pointer, ctx: ToolContext): void {
    if (this._down && this._mode !== 'single') this._apply(p, ctx);
    else this.hover(p, ctx);
  }

  up(): void {
    this._down = false;
  }

  deactivate(): void {
    this._down = false;
  }

  key(code: string, ctx: ToolContext): boolean {
    const n = this._game.config.nature.brushSizes.length;
    if (this._mode === 'single') return false;
    if (code === 'BracketLeft') this._size = Math.max(0, this._size - 1);
    else if (code === 'BracketRight') this._size = Math.min(n - 1, this._size + 1);
    else return false;
    if (this._last) this.hover(this._last, ctx);
    return true;
  }

  private _apply(p: Pointer, ctx: ToolContext): void {
    const g = this._game;
    const props = g.get('props');
    const eco = g.get('economy');
    if (this._mode === 'erase') {
      props.erase(p.x, p.z, this._radius);
      g.sfx('bulldoze');
      return this.hover(p, ctx);
    }
    if (this._mode === 'single') {
      if (!eco.canAfford(this._unit())) {
        g.message('err.money', undefined, 'bad');
        return;
      }
      const placed = props.place(this._kind, p.x, p.z);
      if (placed) {
        eco.spend(PROPS.find((d) => d.id === this._kind)!.cost);
        g.bus.emit('props:changed');
        g.sfx('place');
      } else g.message('hint.natureBlocked', undefined, 'bad');
      return this.hover(p, ctx);
    }
    // кисть: новый мазок, когда курсор прошёл достаточно далеко от прошлого
    if (this._stamp && Math.hypot(p.x - this._stamp.x, p.z - this._stamp.z) < this._radius * 0.45) return this.hover(p, ctx);
    this._stamp = { x: p.x, z: p.z };
    const want = props.stampCount(this._radius, this._density);
    if (!eco.canAfford(want * this._unit())) {
      g.message('err.money', undefined, 'bad');
      this._down = false;
      return;
    }
    const placed = props.brush(this._kinds, p.x, p.z, this._radius, want);
    let cost = 0;
    for (const q of placed) cost += PROPS.find((d) => d.id === q.kind)?.cost ?? 0;
    eco.spend(cost);
    if (placed.length) g.sfx('place');
    this.hover(p, ctx);
  }
}
