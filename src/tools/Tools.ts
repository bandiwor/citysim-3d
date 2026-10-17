import type { Game } from '../core/Game';
import type { Tool, ToolContext } from '../core/Tool';
import type { Cell } from '../core/types';
import { Terrain } from '../world/World';
import { lineCells, rectCells } from './helpers';

const fmt = (n: number): string => n.toLocaleString('ru-RU');

/** Выбор здания; перетаскивание двигает камеру. */
export class SelectTool implements Tool {
  readonly id = 'select';
  readonly panOnDrag = true;
  constructor(private _game: Game) {}
  up(c: Cell): void {
    this._game.bus.emit('select', this._game.world.buildingAt(c.x, c.y) ?? null);
  }
}

/** Строительство дороги перетаскиванием по прямой. */
export class RoadTool implements Tool {
  readonly id: string;
  readonly showGrid = true;
  private _start: Cell | null = null;

  constructor(private _game: Game, private _typeId: string) {
    this.id = `road:${_typeId}`;
  }

  hover(c: Cell | null, ctx: ToolContext): void {
    if (this._start) return;
    if (!c) return ctx.clearPreview();
    this._show([c], ctx);
  }

  down(c: Cell): void {
    this._start = c;
  }

  move(c: Cell, ctx: ToolContext): void {
    if (this._start) this._show(lineCells(this._start, c), ctx);
  }

  up(c: Cell, ctx: ToolContext): void {
    if (!this._start) return;
    const cells = lineCells(this._start, c);
    this._start = null;
    const r = this._game.builder.placeRoads(cells, this._typeId);
    if (r.reason) this._game.message(r.reason, 'bad');
    this._show([c], ctx);
  }

  cancel(ctx: ToolContext): void {
    this._start = null;
    ctx.clearPreview();
  }

  private _show(cells: Cell[], ctx: ToolContext): void {
    const b = this._game.builder;
    let cost = 0;
    const pv = cells.map((c) => {
      const ok = b.canRoad(c.x, c.y);
      if (ok) cost += b.roadCost(c.x, c.y, this._typeId);
      return { x: c.x, y: c.y, ok };
    });
    ctx.setPreview(pv, cost ? `${fmt(Math.round(cost))} ₽` : undefined);
  }
}

/** Зонирование прямоугольником (zoneId = null — снять зону). */
export class ZoneTool implements Tool {
  readonly id: string;
  readonly showGrid = true;
  private _start: Cell | null = null;

  constructor(private _game: Game, private _zoneId: string | null) {
    this.id = `zone:${_zoneId ?? 'none'}`;
  }

  hover(c: Cell | null, ctx: ToolContext): void {
    if (this._start) return;
    if (!c) return ctx.clearPreview();
    this._show([c], ctx);
  }

  down(c: Cell): void {
    this._start = c;
  }

  move(c: Cell, ctx: ToolContext): void {
    if (this._start) this._show(rectCells(this._start, c), ctx);
  }

  up(c: Cell, ctx: ToolContext): void {
    if (!this._start) return;
    const cells = rectCells(this._start, c);
    this._start = null;
    const r = this._game.builder.setZone(cells, this._zoneId);
    if (r.reason) this._game.message(r.reason, 'bad');
    this._show([c], ctx);
  }

  cancel(ctx: ToolContext): void {
    this._start = null;
    ctx.clearPreview();
  }

  private _show(cells: Cell[], ctx: ToolContext): void {
    const w = this._game.world;
    let n = 0;
    const pv = cells.map((c) => {
      const ok = this._zoneId
        ? w.inBounds(c.x, c.y) && w.terrain[w.idx(c.x, c.y)] === Terrain.Land && w.road[w.idx(c.x, c.y)] === 0 && w.occupant[w.idx(c.x, c.y)] === 0
        : w.inBounds(c.x, c.y) && w.zone[w.idx(c.x, c.y)] !== 0;
      if (ok) n++;
      return { x: c.x, y: c.y, ok };
    });
    const cost = this._zoneId ? n * this._game.zoneTypes.require(this._zoneId).cost : 0;
    ctx.setPreview(pv, cost ? `${fmt(cost)} ₽` : undefined);
  }
}

/** Размещение здания-службы. */
export class PlaceTool implements Tool {
  readonly id: string;
  readonly showGrid = true;

  constructor(private _game: Game, private _defId: string) {
    this.id = `service:${_defId}`;
  }

  private _origin(c: Cell): Cell {
    const d = this._game.services.require(this._defId);
    return { x: c.x - Math.floor((d.size[0] - 1) / 2), y: c.y - Math.floor((d.size[1] - 1) / 2) };
  }

  hover(c: Cell | null, ctx: ToolContext): void {
    if (!c) return ctx.clearPreview();
    const d = this._game.services.require(this._defId);
    const o = this._origin(c);
    const res = this._game.builder.canPlaceService(this._defId, o.x, o.y);
    const cells = [];
    for (let dy = 0; dy < d.size[1]; dy++) for (let dx = 0; dx < d.size[0]; dx++) cells.push({ x: o.x + dx, y: o.y + dy, ok: res.ok });
    ctx.setPreview(cells, res.ok ? `${fmt(d.cost)} ₽` : res.reason);
  }

  down(c: Cell, ctx: ToolContext): void {
    const o = this._origin(c);
    const r = this._game.builder.placeService(this._defId, o.x, o.y);
    if (r.reason) this._game.message(r.reason, 'bad');
    this.hover(c, ctx);
  }

  cancel(ctx: ToolContext): void {
    ctx.clearPreview();
  }
}

/** Снос прямоугольником. */
export class BulldozeTool implements Tool {
  readonly id = 'bulldoze';
  readonly showGrid = true;
  private _start: Cell | null = null;

  constructor(private _game: Game) {}

  hover(c: Cell | null, ctx: ToolContext): void {
    if (this._start) return;
    if (!c) return ctx.clearPreview();
    ctx.setPreview([{ x: c.x, y: c.y, ok: false }]);
  }

  down(c: Cell): void {
    this._start = c;
  }

  move(c: Cell, ctx: ToolContext): void {
    if (this._start) ctx.setPreview(rectCells(this._start, c).map((p) => ({ ...p, ok: false })));
  }

  up(c: Cell, ctx: ToolContext): void {
    if (!this._start) return;
    this._game.builder.bulldoze(rectCells(this._start, c));
    this._start = null;
    ctx.setPreview([{ x: c.x, y: c.y, ok: false }]);
  }

  cancel(ctx: ToolContext): void {
    this._start = null;
    ctx.clearPreview();
  }
}

/** Остановка общественного транспорта. */
export class StopTool implements Tool {
  readonly id = 'stop';
  readonly showGrid = true;
  constructor(private _game: Game) {}

  hover(c: Cell | null, ctx: ToolContext): void {
    if (!c) return ctx.clearPreview();
    const w = this._game.world;
    const i = w.idx(c.x, c.y);
    const ok = w.road[i] !== 0 && !w.stop[i] && this._game.roadTypes.at(w.road[i] - 1).access;
    ctx.setPreview([{ x: c.x, y: c.y, ok }], ok ? '250 ₽' : 'Нужна дорога');
  }

  down(c: Cell, ctx: ToolContext): void {
    const r = this._game.builder.placeStop(c.x, c.y);
    if (r.reason) this._game.message(r.reason, 'bad');
    this.hover(c, ctx);
  }

  cancel(ctx: ToolContext): void {
    ctx.clearPreview();
  }
}
