import { CELL } from '../config/constants';
import type { Game } from '../core/Game';
import type { Tool, ToolContext, ToolOption } from '../core/Tool';
import type { Pointer } from '../core/types';
import { fmtMoney, t } from '../i18n';

export type TerraMode = 'raise' | 'lower' | 'flatten' | 'smooth';

const MODE_COLOR: Record<TerraMode, number> = { raise: 0x6fd36f, lower: 0xe39b4a, flatten: 0x57a8ff, smooth: 0xdddddd };

/** Лепка рельефа кистью: поднять, опустить, выровнять, сгладить. Рядом с дорогами и зданиями рельеф защищён. */
export class TerraformTool implements Tool {
  readonly id: string;
  readonly showGrid = false;
  readonly options: ToolOption[];
  private _brush: number;
  private _holding = false;
  private _acc = 0;
  private _last: Pointer | null = null;

  constructor(private _game: Game, private _mode: TerraMode) {
    this.id = `terraform:${_mode}`;
    this._brush = _game.config.terraform.defaultBrush;
    this.options = [
      {
        id: 'brush',
        labelKey: 'opt.brush',
        choices: _game.config.terraform.brushSizes.map((_, i) => ({ id: String(i), labelKey: `opt.brush.${i}` })),
        get: () => String(this._brush),
        set: (id) => (this._brush = Number(id)),
      },
    ];
  }

  private get _radius(): number {
    return this._game.config.terraform.brushSizes[this._brush];
  }

  hover(p: Pointer | null, ctx: ToolContext): void {
    if (!p) {
      this._holding = false;
      return ctx.clearPreview();
    }
    this._last = p;
    const verts = this._game.builder.terrainBrush(p.x, p.z, this._radius);
    const free = verts.filter((v) => !v.protectedPoint);
    const marks = verts.filter((v) => v.protectedPoint).slice(0, 60).map((v) => ({ x: v.i * CELL, z: v.j * CELL }));
    const cost = free.length * this._game.config.terraform.costPerVertex;
    ctx.setPreview({ quads: [], marks, ring: { x: p.x, z: p.z, r: this._radius, ok: true, color: MODE_COLOR[this._mode] }, hint: `${fmtMoney(cost)}${marks.length ? ` · ${t('hint.terraProtected')}` : ''}` });
  }

  down(p: Pointer, ctx: ToolContext): void {
    this._holding = true;
    this._acc = 0;
    this._apply(p, ctx);
  }

  move(p: Pointer, ctx: ToolContext): void {
    this._last = p;
    this.hover(p, ctx);
  }

  up(): void {
    this._holding = false;
  }

  deactivate(): void {
    this._holding = false;
  }

  /** Пока кнопка зажата, рельеф продолжает меняться на месте. */
  tick(dt: number, ctx: ToolContext): void {
    if (!this._holding || !this._last) return;
    this._acc += dt;
    if (this._acc >= 0.14) {
      this._acc = 0;
      this._apply(this._last, ctx);
    }
  }

  key(code: string, ctx: ToolContext): boolean {
    const n = this._game.config.terraform.brushSizes.length;
    if (code === 'BracketLeft') this._brush = Math.max(0, this._brush - 1);
    else if (code === 'BracketRight') this._brush = Math.min(n - 1, this._brush + 1);
    else return false;
    if (this._last) this.hover(this._last, ctx);
    return true;
  }

  private _apply(p: Pointer, ctx: ToolContext): void {
    const r = this._game.builder.terraform(this._mode, p.x, p.z, this._radius);
    if (r.reasonKey) {
      this._game.message(r.reasonKey, undefined, 'bad');
      this._holding = false;
    }
    this.hover(p, ctx);
  }
}

/** Поставить или убрать светофор на перекрёстке. */
export class LightTool implements Tool {
  readonly id: string;
  readonly showGrid = false;

  constructor(private _game: Game, private _on: boolean) {
    this.id = _on ? 'light:add' : 'light:remove';
  }

  hover(p: Pointer | null, ctx: ToolContext): void {
    if (!p) return ctx.clearPreview();
    const node = this._game.builder.junctionNear(p.x, p.z);
    const ok = !!node && node.light !== this._on;
    ctx.setPreview({
      marker: node ? { x: node.x, z: node.z, ok } : null,
      hint: !node ? t('err.light.junction') : ok ? (this._on ? fmtMoney(this._game.config.roads.lightCost) : t('hint.lightRemove')) : t(this._on ? 'err.light.exists' : 'err.light.none'),
    });
  }

  down(p: Pointer, ctx: ToolContext): void {
    const r = this._game.builder.setTrafficLight(p.x, p.z, this._on);
    if (r.reasonKey) {
      this._game.message(r.reasonKey, undefined, 'bad');
      this._game.sfx('error');
    }
    this.hover(p, ctx);
  }
}

/** Автобусная остановка на дороге. */
export class StopTool implements Tool {
  readonly id = 'stop';
  readonly showGrid = false;
  constructor(private _game: Game) {}

  hover(p: Pointer | null, ctx: ToolContext): void {
    if (!p) return ctx.clearPreview();
    const g = this._game;
    const hit = g.world.graph.nearest(p.x, p.z, g.config.roads.snapRadius + 6, (e) => e.access);
    ctx.setPreview({
      marker: hit ? { x: hit.x, z: hit.z, ok: true } : null,
      hint: hit ? fmtMoney(g.config.economy.stopCost) : t('err.stop.road'),
    });
  }

  down(p: Pointer, ctx: ToolContext): void {
    const r = this._game.builder.placeStop(p.x, p.z);
    if (r.reasonKey) {
      this._game.message(r.reasonKey, undefined, 'bad');
      this._game.sfx('error');
    }
    this.hover(p, ctx);
  }
}

/**
 * Создание и редактирование маршрута: клики по остановкам по порядку. Клик по последней остановке убирает её,
 * Backspace — убрать последнюю, Esc/ПКМ — завершить (маршрут короче двух остановок удаляется).
 */
export class RouteTool implements Tool {
  readonly id = 'route';
  readonly showGrid = false;
  private _route: number | null = null;

  constructor(private _game: Game) {}

  /** Редактировать существующий маршрут (из панели маршрутов). */
  setRoute(id: number | null): void {
    this._route = id;
  }

  get routeId(): number | null {
    return this._route;
  }

  private _hintFor(): string {
    const tr = this._game.get('transit');
    const r = this._route ? tr.routeById(this._route) : undefined;
    return r ? t('hint.routeEditing', { id: r.id, n: r.stops.length }) : t('hint.routeStart');
  }

  hover(p: Pointer | null, ctx: ToolContext): void {
    if (!p) return ctx.clearPreview();
    const tr = this._game.get('transit');
    const stop = tr.nearestStop(p.x, p.z, this._game.config.transit.routeSnap);
    ctx.setPreview({ marker: stop ? { x: stop.x, z: stop.z, ok: true } : null, hint: this._hintFor() });
  }

  down(p: Pointer, ctx: ToolContext): void {
    const g = this._game;
    const tr = g.get('transit');
    const stop = tr.nearestStop(p.x, p.z, g.config.transit.routeSnap);
    if (!stop) {
      g.message('err.route.noStop', undefined, 'bad');
      g.sfx('error');
      return;
    }
    let r = this._route ? tr.routeById(this._route) : undefined;
    if (!r) {
      r = tr.createRoute();
      this._route = r.id;
    }
    if (r.stops[r.stops.length - 1] === stop.id) tr.removeStop(r.id, stop.id);
    else tr.addStop(r.id, stop.id);
    g.sfx('stop');
    this.hover(p, ctx);
  }

  key(code: string, ctx: ToolContext): boolean {
    const tr = this._game.get('transit');
    const r = this._route ? tr.routeById(this._route) : undefined;
    if (code === 'Backspace' && r && r.stops.length) {
      tr.popStop(r.id);
      return true;
    }
    if (code === 'Enter') {
      this._finish();
      this._game.bus.emit('tool:request', 'select');
      return true;
    }
    void ctx;
    return false;
  }

  private _finish(): void {
    const tr = this._game.get('transit');
    const r = this._route ? tr.routeById(this._route) : undefined;
    if (r && r.stops.length < 2) {
      tr.deleteRoute(r.id);
      this._game.message('msg.routeTooShort', undefined, 'warn');
    }
    this._route = null;
  }

  deactivate(): void {
    this._finish();
  }
}

/** Прогулка: клик по земле — встать там от первого лица. */
export class WalkTool implements Tool {
  readonly id = 'walk';
  readonly showGrid = false;
  constructor(private _game: Game) {}

  hover(p: Pointer | null, ctx: ToolContext): void {
    if (!p) return ctx.clearPreview();
    ctx.setPreview({ marker: { x: p.x, z: p.z, ok: true }, hint: t('hint.walkHere') });
  }

  down(p: Pointer): void {
    this._game.bus.emit('fp:enter', { x: p.x, z: p.z });
  }
}
