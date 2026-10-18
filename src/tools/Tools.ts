import { CELL } from '../config/constants';
import type { Game } from '../core/Game';
import type { Tool, ToolContext, ToolOption } from '../core/Tool';
import type { Pointer } from '../core/types';
import { fmtMoney, t } from '../i18n';
import type { RoadSnap } from '../sim/Builder';
import type { Vec2 } from '../world/geometry';

/** Выбор здания; перетаскивание двигает камеру. */
export class SelectTool implements Tool {
  readonly id = 'select';
  readonly panOnDrag = true;
  constructor(private _game: Game) {}
  up(p: Pointer): void {
    const g = this._game;
    const stop = g.get('transit').nearestStop(p.x, p.z, 4);
    const b = g.world.buildingAt(p.x, p.z);
    if (stop && !b) {
      g.bus.emit('select', null);
      g.bus.emit('select:stop', stop.id);
      return;
    }
    g.bus.emit('select:stop', null);
    g.bus.emit('select', b ?? null);
  }

  hover(p: Pointer | null, ctx: ToolContext): void {
    if (!p) return ctx.clearPreview();
    const b = this._game.world.buildingAt(p.x, p.z);
    if (!b) return ctx.clearPreview();
    const g = this._game;
    const name = b.kind === 'zone' ? t(`zone.${b.zone}.name`) : t(`service.${b.defId}.name`);
    const z = b.kind === 'zone' ? g.zoneTypes.require(b.zone) : null;
    const lv = z ? `${'★'.repeat(b.level)} ` : '';
    const detail = z ? (z.housing ? `👥 ${Math.round(b.pop)}/${Math.round(b.cap)}` : `💼 ${Math.round(b.workers)}/${Math.round(b.jobs)}`) : b.jobs ? `💼 ${Math.round(b.workers)}/${Math.round(b.jobs)}` : '';
    ctx.setPreview({ hint: `${lv}${name}${detail ? ` · ${detail}` : ''}` });
  }
}

type RoadMode = 'straight' | 'curve';
/** привязка: умная (узлы, дороги, Shift — 15°), выключена, сетка, строго под 90° */
type SnapMode = 'smart' | 'free' | 'grid' | 'ortho';
const SNAP_MODES: SnapMode[] = ['smart', 'free', 'grid', 'ortho'];

/**
 * Свободное строительство дорог: клик — начало, клик — конец (прямая); в режиме «кривая» между ними
 * ставится опорная точка. После постройки дорога продолжается от конца. Shift — угловая привязка.
 */
export class RoadTool implements Tool {
  readonly id: string;
  readonly showGrid = true;
  readonly options: ToolOption[];
  private _mode: RoadMode = 'straight';
  private _snapMode: SnapMode = 'smart';
  /** опорное направление для режима 90° */
  private _ref = 0;
  private _start: RoadSnap | null = null;
  private _ctrl: Vec2 | null = null;
  private _downAt: Vec2 | null = null;
  private _last: Pointer | null = null;

  constructor(private _game: Game, private _typeId: string) {
    this.id = `road:${_typeId}`;
    this.options = [
      {
        id: 'mode',
        labelKey: 'opt.roadMode',
        choices: [
          { id: 'straight', labelKey: 'opt.roadMode.straight' },
          { id: 'curve', labelKey: 'opt.roadMode.curve' },
        ],
        get: () => this._mode,
        set: (id) => {
          this._mode = id as RoadMode;
          this._ctrl = null;
        },
      },
      {
        id: 'snap',
        labelKey: 'opt.roadSnap',
        choices: SNAP_MODES.map((m) => ({ id: m, labelKey: `opt.roadSnap.${m}` })),
        get: () => this._snapMode,
        set: (id) => (this._snapMode = id as SnapMode),
      },
    ];
  }

  /** Точка с учётом выбранной привязки. */
  private _snapPoint(p: Pointer, from?: Vec2): RoadSnap {
    const b = this._game.builder;
    const cell = this._game.config.world.snapGrid;
    switch (this._snapMode) {
      case 'free':
        return { x: p.x, z: p.z, kind: 'free' };
      case 'grid':
        return b.snap(Math.round(p.x / cell) * cell, Math.round(p.z / cell) * cell, { from, shift: false });
      case 'ortho': {
        if (!from) return b.snap(p.x, p.z);
        // направление — ближайшее кратное 90° к опорному (вдоль или поперёк начатой/пересекаемой дороги)
        const dx = p.x - from.x;
        const dz = p.z - from.z;
        const len = Math.hypot(dx, dz);
        const q = Math.PI / 2;
        const a = this._ref + Math.round((Math.atan2(dz, dx) - this._ref) / q) * q;
        const proj = Math.max(0, dx * Math.cos(a) + dz * Math.sin(a));
        void len;
        return b.snap(from.x + Math.cos(a) * proj, from.z + Math.sin(a) * proj, { from });
      }
      default:
        return b.snap(p.x, p.z, { from, shift: p.shift });
    }
  }

  /** Опорный угол для режима 90°: касательная дороги в точке старта, иначе ось мира. */
  private _refFor(start: RoadSnap): number {
    const graph = this._game.world.graph;
    if (start.kind === 'free') return 0;
    const hit = graph.nearest(start.x, start.z, 4);
    return hit ? Math.atan2(hit.tz, hit.tx) : 0;
  }

  hover(p: Pointer | null, ctx: ToolContext): void {
    if (!p) return ctx.clearPreview();
    this._last = p;
    this._refresh(p, ctx);
  }

  move(p: Pointer, ctx: ToolContext): void {
    this.hover(p, ctx);
  }

  down(p: Pointer, ctx: ToolContext): void {
    const snap = this._snapPoint(p, this._start ?? undefined);
    if (!this._start) {
      this._start = snap;
      this._ref = this._refFor(snap);
      this._downAt = { x: p.x, z: p.z };
    } else if (this._mode === 'curve' && !this._ctrl) {
      this._ctrl = { x: snap.x, z: snap.z };
    } else {
      this._downAt = null;
      this._finish(snap, ctx);
    }
    this._refresh(p, ctx);
  }

  up(p: Pointer, ctx: ToolContext): void {
    // протяжка мышью от начала = второй клик
    if (this._start && this._downAt && this._mode === 'straight' && Math.hypot(p.x - this._downAt.x, p.z - this._downAt.z) > 14) {
      this._finish(this._snapPoint(p, this._start), ctx);
    }
    this._downAt = null;
  }

  escape(ctx: ToolContext): boolean {
    if (!this._start) return false;
    this._reset();
    ctx.clearPreview();
    return true;
  }

  deactivate(): void {
    this._reset();
  }

  key(code: string, ctx: ToolContext): boolean {
    if (code === 'KeyV') {
      this._snapMode = SNAP_MODES[(SNAP_MODES.indexOf(this._snapMode) + 1) % SNAP_MODES.length];
      if (this._last) this._refresh(this._last, ctx);
      return true;
    }
    if (code !== 'KeyC') return false;
    this.options[0].set(this._mode === 'straight' ? 'curve' : 'straight');
    if (this._last) this._refresh(this._last, ctx);
    return true;
  }

  private _reset(): void {
    this._start = null;
    this._ctrl = null;
    this._downAt = null;
  }

  private _finish(end: RoadSnap, ctx: ToolContext): void {
    const b = this._game.builder;
    const plan = b.planRoad(this._start!, end, this._ctrl, this._typeId);
    const r = b.buildRoad(plan);
    if (r.ok) {
      this._start = b.snap(end.x, end.z);
      this._ref = this._refFor(this._start);
      this._ctrl = null;
    } else if (r.reasonKey) this._game.message(r.reasonKey, undefined, 'bad');
    void ctx;
  }

  private _refresh(p: Pointer, ctx: ToolContext): void {
    const b = this._game.builder;
    const snap = this._snapPoint(p, this._start ?? undefined);
    const marker = { x: snap.x, z: snap.z, ok: true };
    if (!this._start) return ctx.setPreview({ marker, ribbon: null, quads: [], marks: [], hint: t('hint.roadStart') });
    const ctrl = this._mode === 'curve' ? this._ctrl : null;
    if (this._mode === 'curve' && !this._ctrl) {
      const plan = b.planRoad(this._start, snap, null, this._typeId);
      return ctx.setPreview({ marker, ribbon: { pts: plan.pts, hw: plan.hw, ok: plan.ok }, quads: [], marks: [], hint: t('hint.roadCtrl') });
    }
    const plan = b.planRoad(this._start, snap, ctrl, this._typeId);
    let hint = plan.ok ? `${fmtMoney(plan.cost)} · ${Math.round(plan.length)} ${t('unit.meters')}${plan.levelCost ? ` · ⛰️ ${t('hint.autoLevel', { cost: fmtMoney(plan.levelCost) })}` : ''}` : t(plan.reasonKey ?? 'err.road.short');
    if (plan.reasonKey === 'err.terrain') hint += ` · ${t('hint.useTerraform')}`;
    if (plan.reasonKey === 'err.road.building') hint += ` · ${t('hint.bulldozeIt')}`;
    // мешающие здания подсвечиваем красным, места с рельефом/дорогой — метками
    const world = this._game.world;
    const quads = plan.blockers
      .filter((m) => m.buildingId)
      .flatMap((m) => {
        const bd = world.buildings.get(m.buildingId);
        return bd ? [{ x: bd.x, z: bd.z, rot: bd.rot, w: bd.w + 0.6, d: bd.d + 0.6, ok: false }] : [];
      });
    // здания зон на пути дороги будут снесены: подсвечиваем оранжевым
    for (const id of plan.demolish ?? []) {
      const bd = world.buildings.get(id);
      if (bd) quads.push({ x: bd.x, z: bd.z, rot: bd.rot, w: bd.w + 0.6, d: bd.d + 0.6, ok: true, color: 0xff9f40 } as (typeof quads)[number]);
    }
    if (plan.ok && plan.demolish?.length) hint += ` · 🏚️ ${t('hint.autoDemolish', { n: plan.demolish.length })}`;
    const marks = plan.blockers.filter((m) => !m.buildingId).map((m) => ({ x: m.x, z: m.z }));
    ctx.setPreview({ marker: { ...marker, ok: plan.ok }, ribbon: { pts: plan.pts, hw: plan.hw, ok: plan.ok }, quads, marks, hint });
  }
}

/** Зонирование кистью по клеткам вдоль дорог (zoneId = null — снять зону). [ и ] — размер кисти. Цвет кисти — цвет зоны. */
export class ZoneTool implements Tool {
  readonly id: string;
  readonly showGrid = true;
  readonly options: ToolOption[];
  private _brush: number;
  private _painting = false;
  private _last: Pointer | null = null;

  constructor(private _game: Game, private _zoneId: string | null) {
    this.id = `zone:${_zoneId ?? 'none'}`;
    this._brush = _game.config.zoning.defaultBrush;
    this.options = [
      {
        id: 'brush',
        labelKey: 'opt.brush',
        choices: _game.config.zoning.brushSizes.map((_, i) => ({ id: String(i), labelKey: `opt.brush.${i}` })),
        get: () => String(this._brush),
        set: (id) => (this._brush = Number(id)),
      },
    ];
  }

  private get _radius(): number {
    return this._game.config.zoning.brushSizes[this._brush];
  }

  /** Цвет кисти: зона — её цвет, удаление — красный. */
  private get _color(): number {
    return this._zoneId ? this._game.zoneTypes.require(this._zoneId).color : 0xff4d4d;
  }

  hover(p: Pointer | null, ctx: ToolContext): void {
    if (!p) {
      this._painting = false;
      return ctx.clearPreview();
    }
    this._last = p;
    const r = this._radius;
    const target = this._zoneId ? this._game.zoneTypes.require(this._zoneId).index + 1 : 0;
    const cells = this._game.builder.cellsInBrush(p.x, p.z, r);
    const color = this._color;
    const quads = cells.map((c) => {
      const ok = c.zone !== target && (target === 0 || !c.building);
      return { x: c.x, z: c.z, rot: c.rot, w: CELL - 0.4, d: CELL - 0.4, ok, color: ok ? color : 0x888888 };
    });
    const n = quads.filter((q) => q.ok).length;
    const cost = this._zoneId ? n * this._game.zoneTypes.require(this._zoneId).cost : 0;
    ctx.setPreview({ quads, marks: [], ring: { x: p.x, z: p.z, r, ok: true, color }, hint: cells.length ? (cost ? `${fmtMoney(cost)} · ${n}` : String(n)) : t('hint.noCells') });
  }

  down(p: Pointer, ctx: ToolContext): void {
    this._painting = true;
    this._paint(p, ctx);
  }

  move(p: Pointer, ctx: ToolContext): void {
    if (this._painting) this._paint(p, ctx);
    else this.hover(p, ctx);
  }

  up(): void {
    this._painting = false;
  }

  deactivate(): void {
    this._painting = false;
  }

  key(code: string, ctx: ToolContext): boolean {
    const n = this._game.config.zoning.brushSizes.length;
    if (code === 'BracketLeft') this._brush = Math.max(0, this._brush - 1);
    else if (code === 'BracketRight') this._brush = Math.min(n - 1, this._brush + 1);
    else return false;
    if (this._last) this.hover(this._last, ctx);
    return true;
  }

  private _paint(p: Pointer, ctx: ToolContext): void {
    const r = this._game.builder.paintZone(p.x, p.z, this._radius, this._zoneId);
    if (r.reasonKey) this._game.message(r.reasonKey, undefined, 'bad');
    this.hover(p, ctx);
  }
}

/** Размещение здания-службы: примагничивается к дороге фасадом к ней. , и . — поворот вне дороги. */
export class PlaceTool implements Tool {
  readonly id: string;
  readonly showGrid = true;
  private _rot = 0;
  private _last: Pointer | null = null;

  constructor(private _game: Game, private _defId: string) {
    this.id = `service:${_defId}`;
  }

  private _spot(p: Pointer): { x: number; z: number; rot: number; snapped: boolean } {
    const s = this._game.builder.snapService(this._defId, p.x, p.z);
    return s.snapped ? s : { ...s, rot: this._rot * (Math.PI / 2) };
  }

  hover(p: Pointer | null, ctx: ToolContext): void {
    if (!p) return ctx.clearPreview();
    this._last = p;
    const s = this._spot(p);
    const res = this._game.builder.canPlaceService(this._defId, s.x, s.z, s.rot);
    const obb = this._game.builder.serviceObb(this._defId, s.x, s.z, s.rot);
    const def = this._game.services.require(this._defId);
    const lv = res.ok ? this._game.builder.serviceCut(this._defId, s.x, s.z, s.rot).length : 0;
    ctx.setPreview({
      quads: [{ x: s.x, z: s.z, rot: s.rot, w: obb.hw * 2, d: obb.hd * 2, ok: res.ok }],
      hint: res.ok ? `${fmtMoney(def.cost)}${lv ? ` · ⛰️ ${t('hint.autoLevel', { cost: fmtMoney(lv * this._game.config.terraform.costPerVertex) })}` : ''}` : t(res.reasonKey ?? 'err.occupied'),
    });
  }

  down(p: Pointer, ctx: ToolContext): void {
    const s = this._spot(p);
    const r = this._game.builder.placeService(this._defId, s.x, s.z, s.rot);
    if (r.reasonKey) {
      this._game.message(r.reasonKey, undefined, 'bad');
      this._game.sfx('error');
    }
    this.hover(p, ctx);
  }

  key(code: string, ctx: ToolContext): boolean {
    if (code !== 'Comma' && code !== 'Period') return false;
    this._rot = (this._rot + (code === 'Period' ? 1 : 3)) % 4;
    if (this._last) this.hover(this._last, ctx);
    return true;
  }
}

/** Снос прямоугольником в мировых координатах. */
export class BulldozeTool implements Tool {
  readonly id = 'bulldoze';
  readonly showGrid = true;
  private _start: Vec2 | null = null;

  constructor(private _game: Game) {}

  hover(p: Pointer | null, ctx: ToolContext): void {
    if (!p) return ctx.clearPreview();
    const a = this._start ?? p;
    ctx.setPreview({
      quads: [{ x: (a.x + p.x) / 2, z: (a.z + p.z) / 2, rot: 0, w: Math.max(CELL, Math.abs(p.x - a.x)), d: Math.max(CELL, Math.abs(p.z - a.z)), ok: false }],
    });
  }

  down(p: Pointer, _ctx?: ToolContext): void {
    this._start = { x: p.x, z: p.z };
  }

  move(p: Pointer, ctx: ToolContext): void {
    this.hover(p, ctx);
  }

  up(p: Pointer, ctx: ToolContext): void {
    if (!this._start) return;
    const a = this._start;
    this._start = null;
    // клик без протяжки захватывает область размером с клетку
    const pad = Math.hypot(p.x - a.x, p.z - a.z) < 3 ? CELL / 2 : 0;
    this._game.builder.bulldozeRect(Math.min(a.x, p.x) - pad, Math.min(a.z, p.z) - pad, Math.max(a.x, p.x) + pad, Math.max(a.z, p.z) + pad);
    this.hover(p, ctx);
  }

  escape(ctx: ToolContext): boolean {
    if (!this._start) return false;
    this._start = null;
    ctx.clearPreview();
    return true;
  }
}
