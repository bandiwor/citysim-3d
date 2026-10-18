import { anyCheat } from '../core/cheats';
import type { Game } from '../core/Game';
import type { Modifier } from './ModifierSystem';
import type { Objective } from './ObjectiveSystem';
import type { System } from '../core/System';

declare module '../core/Game' {
  interface SystemMap {
    save: SaveSystem;
  }
}

interface SavedNode {
  id: number;
  x: number;
  z: number;
  /** 1 — светофор */
  lt?: 1;
}
interface SavedEdge {
  id: number;
  a: number;
  b: number;
  /** id типа дороги */
  t: string;
  br: 0 | 1;
  ow?: 1;
  /** ломаная [x0, z0, x1, z1, …] */
  p: number[];
}
interface SavedCell {
  id: number;
  x: number;
  z: number;
  r: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  row: number;
  /** id зоны ('' — нет) */
  zone: string;
  /** плотность */
  dn?: number;
}
interface SavedBuilding {
  id: number;
  k: 'zone' | 'service';
  d: string;
  x: number;
  z: number;
  r: number;
  w: number;
  h: number;
  c: number;
  l: number;
  v: number;
  p: number;
  g: number;
  a: 0 | 1;
  ga?: number;
  de?: number;
  st?: number;
  up?: number;
  /** благосостояние */
  we?: number;
}

interface SavedRoute {
  id: number;
  color: number;
  stops: number[];
  buses: number;
  carried: number;
}

export interface SaveData {
  v: 2;
  seed: number;
  size: number;
  time: { day: number; month: number; year: number; tod: number; total: number };
  money: number;
  debt: number;
  taxes: Record<string, number>;
  funding: Record<string, number>;
  nodes: SavedNode[];
  edges: SavedEdge[];
  cells: SavedCell[];
  stops: { id?: number; x: number; z: number }[];
  routes?: SavedRoute[];
  buildings: SavedBuilding[];
  history: { net: number[]; pop: number[]; money: number[] };
  /** правки рельефа: [индекс вершины, высота] */
  terrain?: [number, number][];
  mode?: 'career' | 'sandbox';
  progress?: { peak: number };
  policies?: string[];
  objectives?: { active: Objective[]; completed: number };
  mods?: Modifier[];
  /** доли образованных: [с образованием, с высшим] */
  /** стиль ландшафта (нет — сохранение со старым генератором) */
  /** включённые читы */
  ch?: Partial<import('../core/cheats').Cheats>;
  ts?: { mountains: number; hills: number; rivers: number; lakes: number };
  edu?: [number, number];
  /** посаженные растения [вид, x, z, масштаб, поворот] и стёртые процедурные деревья */
  props?: [string, number, number, number, number][];
  et?: number[];
  event?: { id: string; day: number } | null;
}

/** Маршруты из сохранения, ожидающие запуска игры. */
const pendingRoutes = new WeakMap<Game, SavedRoute[]>();
const pendingState = new WeakMap<Game, SaveData>();

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Сохранение в localStorage. Формат явный и не зависит от имён внутренних полей. */
export class SaveSystem implements System {
  readonly id = 'save';
  readonly order = 90;
  private _game!: Game;

  /** Читает сохранение (null — нет или формат устарел). */
  static peek(key: string): SaveData | null {
    try {
      const raw = localStorage.getItem(key);
      const d = raw ? (JSON.parse(raw) as SaveData) : null;
      return d && d.v === 2 ? d : null;
    } catch {
      return null;
    }
  }

  update(): void {
    this._restoreState();
    const routes = pendingRoutes.get(this._game);
    if (!routes) return;
    pendingRoutes.delete(this._game);
    const g = this._game;
    const tr = g.get('transit');
    for (const r of routes) {
      const route = tr.createRoute(r.id);
      route.color = r.color;
      route.stops = r.stops.filter((id) => g.world.stops.some((s) => s.id === id));
      route.buses = r.buses;
      route.carried = r.carried;
    }
  }

  /** Состояние механик прогресса, целей, политик и событий из сохранения. */
  private _restoreState(): void {
    const d = pendingState.get(this._game);
    if (!d) return;
    pendingState.delete(this._game);
    const g = this._game;
    g.get('progress').restore(d.progress?.peak ?? 0);
    if (d.edu) g.get('stats').restoreEdu(d.edu[0], d.edu[1]);
    g.get('policy').restore(d.policies ?? []);
    for (const id of g.get('policy').enabled) g.get('policy').refresh(id);
    for (const m of d.mods ?? []) g.get('mods').put(m);
    const ob = g.get('objectives');
    ob.active = (d.objectives?.active ?? []).filter((o) => o && typeof o.kind === 'string');
    ob.completed = d.objectives?.completed ?? 0;
    if (d.event) g.get('events').pending = d.event;
    g.bus.emit('objectives:changed');
    if (d.event) g.bus.emit('event:show');
  }

  init(game: Game): void {
    this._game = game;
    let months = 0;
    game.bus.on('time:month', () => {
      if (++months % game.config.save.autosaveMonths === 0) this.save(true);
    });
  }

  serialize(): SaveData {
    const g = this._game;
    const w = g.world;
    const t = g.get('time');
    const e = g.get('economy');
    const zoneId = (idx: number): string => (idx ? g.zoneTypes.at(idx - 1).id : '');
    return {
      v: 2,
      seed: w.seed,
      size: w.size,
      time: { day: t.day, month: t.month, year: t.year, tod: t.tod, total: t.totalDays },
      money: e.money,
      debt: e.debt,
      taxes: { ...e.taxes },
      funding: { ...e.funding },
      nodes: [...w.graph.nodes.values()].map((n) => ({ id: n.id, x: r1(n.x), z: r1(n.z), ...(n.light ? { lt: 1 as const } : {}) })),
      edges: [...w.graph.edges.values()].map((ed) => ({ id: ed.id, a: ed.a, b: ed.b, t: g.roadTypes.at(ed.type).id, br: ed.bridge ? 1 : 0, ...(ed.oneway ? { ow: 1 as const } : {}), p: ed.pts.flatMap((p) => [r1(p.x), r1(p.z)]) })),
      cells: w.zones.list().map((c) => ({ id: c.id, x: r1(c.x), z: r1(c.z), r: Math.round(c.rot * 1000) / 1000, tx: r1(c.tx * 100) / 100, tz: r1(c.tz * 100) / 100, nx: r1(c.nx * 100) / 100, nz: r1(c.nz * 100) / 100, row: c.row, zone: zoneId(c.zone), ...(c.density ? { dn: c.density } : {}) })),
      stops: w.stops.map((s) => ({ id: s.id, x: r1(s.x), z: r1(s.z) })),
      routes: g.get('transit').routes.map((r) => ({ id: r.id, color: r.color, stops: [...r.stops], buses: r.buses, carried: r.carried })),
      buildings: w.list().map((b) => ({ id: b.id, k: b.kind, d: b.defId, x: r1(b.x), z: r1(b.z), r: Math.round(b.rot * 1000) / 1000, w: b.w, h: b.d, c: b.cell, l: b.level, we: b.wealth, v: b.variant, p: Math.round(b.pop), g: b.goods, a: b.abandoned ? 1 : 0, ga: Math.round(b.garbage * 10) / 10, de: b.dead, st: Math.round(b.stored), ...(b.up ? { up: b.up } : {}) })),
      history: { net: e.history.net, pop: e.history.pop, money: e.history.money },
      terrain: [...w.terrainEdits].map(([k, h]) => [k, Math.round(h * 100) / 100] as [number, number]),
      mode: g.config.progress.enabled ? 'career' : 'sandbox',
      progress: { peak: g.get('progress').peakPop },
      policies: [...g.get('policy').enabled],
      objectives: { active: g.get('objectives').active, completed: g.get('objectives').completed },
      mods: g.get('mods').active.filter((m) => !m.id.startsWith('policy:')),
      ...(g.terrainStyle ? { ts: g.terrainStyle } : {}),
      ...(anyCheat(g.cheats) ? { ch: g.cheats } : {}),
      edu: [g.get('stats').eduEducated, g.get('stats').eduHigh],
      ...(w.props.size ? { props: [...w.props.values()].map((p) => [p.kind, r1(p.x), r1(p.z), Math.round(p.s * 100) / 100, Math.round(p.rot * 100) / 100] as [string, number, number, number, number]) } : {}),
      ...(w.erasedTrees.size ? { et: [...w.erasedTrees] } : {}),
      event: g.get('events').pending,
    };
  }

  save(silent = false): boolean {
    const g = this._game;
    try {
      localStorage.setItem(g.config.save.key, JSON.stringify(this.serialize()));
      if (!silent) g.message('msg.saved', undefined, 'good');
      return true;
    } catch {
      g.message('msg.saveFailed', undefined, 'bad');
      return false;
    }
  }

  /** Применяет сохранение к свежесозданной игре (до game.start()). */
  static apply(g: Game, d: SaveData): void {
    const w = g.world;
    if (d.terrain?.length) {
      const n1 = w.size + 1;
      for (const [k, h] of d.terrain) w.setVertexHeight(k % n1, Math.floor(k / n1), h);
      w.reclassify(0, 0, w.size, w.size);
    }
    for (const [kind, x, z, s, rot] of d.props ?? []) w.props.set(w.newId(), { id: 0, kind, x, z, s, rot });
    for (const [id, p] of [...w.props]) p.id = id;
    for (const id of d.et ?? []) w.erasedTrees.add(id);
    for (const n of d.nodes) w.graph.restoreNode(n.id, n.x, n.z, !!n.lt);
    for (const e of d.edges) {
      const type = g.roadTypes.get(e.t);
      if (!type) continue;
      const pts = [];
      for (let i = 0; i < e.p.length; i += 2) pts.push({ x: e.p[i], z: e.p[i + 1] });
      w.graph.addEdge(e.a, e.b, pts, { type: type.index, hw: type.width / 2, access: type.access, bridge: !!e.br, oneway: !!e.ow }, e.id);
    }
    for (const c of d.cells) {
      const zone = c.zone ? (g.zoneTypes.get(c.zone)?.index ?? -1) + 1 : 0;
      w.zones.add({ x: c.x, z: c.z, rot: c.r, tx: c.tx, tz: c.tz, nx: c.nx, nz: c.nz, row: c.row, zone, density: c.dn ?? 0, building: 0, edge: 0, s: 0 }, c.id);
    }
    for (const s of d.stops) {
      const id = s.id ?? w.newId();
      w.bumpId(id);
      w.stops.push({ id, edge: 0, s: 0, x: s.x, z: s.z });
    }
    // системы инициализируются в game.start(): маршруты и состояние механик восстанавливаются в первом кадре
    pendingRoutes.set(g, d.routes ?? []);
    pendingState.set(g, d);
    for (const s of d.buildings) {
      if (s.k === 'zone' ? !g.zoneTypes.has(s.d) : !g.services.has(s.d)) continue;
      const b = g.builder.createBuilding(s.k, s.d, s.x, s.z, s.r, s.w, s.h, s.c);
      b.id = s.id;
      b.level = s.l;
      b.wealth = s.we ?? 1;
      b.variant = s.v;
      b.up = s.up ?? 0;
      g.builder.applyStats(b);
      b.pop = Math.min(s.p, b.cap);
      b.goods = s.g;
      b.abandoned = !!s.a;
      b.garbage = s.ga ?? 0;
      b.dead = s.de ?? 0;
      b.stored = s.st ?? 0;
      g.builder.addBuilding(b);
    }
    const t = g.get('time');
    Object.assign(t, { day: d.time.day, month: d.time.month, year: d.time.year, tod: d.time.tod, totalDays: d.time.total });
    const e = g.get('economy');
    e.money = d.money;
    e.debt = d.debt;
    Object.assign(e.taxes, d.taxes);
    Object.assign(e.funding, d.funding);
    e.history = d.history;
    g.builder.refreshAccess();
  }
}
