import { effectiveDef } from '../data/services';
import { CELL } from '../config/constants';
import type { Game } from '../core/Game';
import { t } from '../i18n';
import type { Building } from '../core/types';
import { bezier2, dist, obbDist, obbOverlap, pointAtLength, polyDistToObb, polyLength, resample, segIntersect, yawOf, type Obb, type Vec2 } from '../world/geometry';
import type { RoadEdge, RoadNode } from '../world/RoadGraph';
import { Terrain } from '../world/Terrain';
import { generateCells, pruneCellsNear, refreshCellAccess } from '../world/zoning';
import type { ZoneCell } from '../world/ZoneGrid';

export interface PlaceResult {
  ok: boolean;
  /** ключ i18n причины отказа */
  reasonKey?: string;
}

export interface RoadSnap {
  x: number;
  z: number;
  kind: 'free' | 'node' | 'edge';
  node?: number;
  edge?: number;
}

export interface RoadCrossing {
  /** позиция вдоль новой дороги */
  s: number;
  x: number;
  z: number;
}

/** Что именно мешает построить дорогу (для подсветки в предпросмотре). */
export interface RoadBlocker {
  kind: 'terrain' | 'building' | 'bounds' | 'angle' | 'close';
  x: number;
  z: number;
  /** id здания, если помеха — здание */
  buildingId: number;
}

export interface RoadPlan extends PlaceResult {
  typeId: string;
  cost: number;
  length: number;
  pts: Vec2[];
  hw: number;
  start: RoadSnap;
  end: RoadSnap;
  crossings: RoadCrossing[];
  blockers: RoadBlocker[];
  /** вершины рельефа, которые будут срезаны под дорогу (автовыравнивание) */
  level?: number[];
  levelCost?: number;
}

export interface ServiceSpot {
  x: number;
  z: number;
  rot: number;
  snapped: boolean;
}

const fail = (reasonKey: string): PlaceResult => ({ ok: false, reasonKey });

/** Единственная точка изменения мира игроком/симуляцией: проверки, деньги, события. */
export class Builder {
  constructor(private _game: Game) {}

  private get _cfg() {
    return this._game.config;
  }

  // ================= дороги =================

  /** Привязка курсора: к узлу, к дороге (с разрезанием) или свободная точка. */
  snap(x: number, z: number, opts: { from?: Vec2; shift?: boolean } = {}): RoadSnap {
    const g = this._game.world.graph;
    const r = this._cfg.roads;
    let px = x;
    let pz = z;
    const node = g.nearestNode(px, pz, r.snapRadius);
    if (node) return { x: node.x, z: node.z, kind: 'node', node: node.id };
    if (opts.shift && opts.from) {
      const dx = px - opts.from.x;
      const dz = pz - opts.from.z;
      const len = Math.hypot(dx, dz);
      const step = (r.angleSnap * Math.PI) / 180;
      const a = Math.round(Math.atan2(dz, dx) / step) * step;
      px = opts.from.x + Math.cos(a) * len;
      pz = opts.from.z + Math.sin(a) * len;
    }
    const hit = g.nearest(px, pz, r.snapRadius + 4);
    if (hit && hit.d <= Math.max(r.snapRadius * 0.6, hit.edge.hw)) {
      const n2 = g.nearestNode(hit.x, hit.z, r.junctionMerge);
      if (n2) return { x: n2.x, z: n2.z, kind: 'node', node: n2.id };
      return { x: hit.x, z: hit.z, kind: 'edge', edge: hit.edge.id };
    }
    return { x: px, z: pz, kind: 'free' };
  }

  roadPoints(a: Vec2, b: Vec2, ctrl: Vec2 | null): Vec2[] {
    const sp = this._cfg.roads.sampleSpacing;
    return ctrl ? bezier2(a, ctrl, b, sp) : resample([a, b], sp);
  }

  /** Проверяет и описывает дорогу, ничего не меняя. */
  planRoad(a: RoadSnap, b: RoadSnap, ctrl: Vec2 | null, typeId: string): RoadPlan {
    const game = this._game;
    const world = game.world;
    const cfg = this._cfg;
    const type = game.roadTypes.require(typeId);
    const hw = type.width / 2;
    const pts = this.roadPoints(a, b, ctrl);
    const length = polyLength(pts);
    const plan: RoadPlan = { ok: false, typeId, cost: 0, length, pts, hw, start: a, end: b, crossings: [], blockers: [] };
    const bad = (key: string): RoadPlan => ({ ...plan, ok: false, reasonKey: key });

    if (length < cfg.roads.minSegmentLength) return bad('err.road.short');
    if (a.node && a.node === b.node) return bad('err.road.same');

    // Собираем ВСЕ помехи, чтобы игроку было видно, что именно мешает.
    const blockers: RoadBlocker[] = [];
    const reasons = new Set<string>();
    const block = (kind: RoadBlocker['kind'], x: number, z: number, key: string, buildingId = 0): void => {
      reasons.add(key);
      if (blockers.length < 40 && !blockers.some((m) => Math.hypot(m.x - x, m.z - z) < 4 && m.kind === kind)) blockers.push({ kind, x, z, buildingId });
    };

    // рельеф и границы
    let waterLen = 0;
    const hillSamples: Vec2[] = [];
    const cum: number[] = [0];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i > 0) cum.push(cum[i - 1] + dist(pts[i - 1], p));
      if (!world.inBounds(p.x, p.z, cfg.world.edgeMargin)) block('bounds', p.x, p.z, 'err.bounds');
      const tan = i < pts.length - 1 ? norm2(pts[i + 1], p) : norm2(p, pts[i - 1]);
      for (const side of [-1, 0, 1]) {
        const sx = p.x - tan.z * hw * side;
        const sz = p.z + tan.x * hw * side;
        const t = world.terrainAt(sx, sz);
        if (t === Terrain.Blocked) {
          block('terrain', sx, sz, 'err.terrain');
          hillSamples.push({ x: sx, z: sz });
        }
        if (t === Terrain.Water && side === 0 && i > 0) waterLen += cum[i] - cum[i - 1];
      }
    }

    // здания: расстояние до каждого отрезка дороги, а не только до точек
    for (const p of pts) {
      for (const bd of world.buildingsNear(p.x, p.z, 30)) {
        if (obbDist(world.obbOf(bd), p) < hw + cfg.roads.buildingClearance) block('building', bd.x, bd.z, 'err.road.building', bd.id);
      }
    }

    // пересечения
    const ends = [a, b];
    const crossings: RoadCrossing[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
      for (const e of world.graph.edgesNear(mid.x, mid.z, dist(p, q) / 2 + 1)) {
        for (let j = 0; j < e.pts.length - 1; j++) {
          const hit = segIntersect(p, q, e.pts[j], e.pts[j + 1]);
          if (!hit) continue;
          const s = cum[i] + hit.t * (cum[i + 1] - cum[i]);
          if (s < 1.5 || s > length - 1.5) continue;
          if (crossings.some((c) => Math.abs(c.s - s) < 2)) continue;
          const tn = norm2(q, p);
          const te = norm2(e.pts[j + 1], e.pts[j]);
          const ang = Math.acos(Math.min(1, Math.abs(tn.x * te.x + tn.z * te.z)));
          if (ang < (cfg.roads.minJunctionAngle * Math.PI) / 180) block('angle', hit.x, hit.z, 'err.road.angle');
          crossings.push({ s, x: hit.x, z: hit.z });
        }
      }
    }
    crossings.sort((m, n) => m.s - n.s);

    // слишком близко к другой дороге без пересечения
    for (const p of pts) {
      if (ends.some((en) => dist(en, p) < hw * 3 + 6)) continue;
      for (const e of world.graph.edgesNear(p.x, p.z, hw + 16)) {
        let d = Infinity;
        for (let j = 0; j < e.pts.length - 1; j++) d = Math.min(d, segDist(p, e.pts[j], e.pts[j + 1]));
        const need = (hw + e.hw) * 0.95;
        if (d < need && !crossings.some((c) => dist(c, p) < (hw + e.hw) * 3)) block('close', p.x, p.z, 'err.road.close');
      }
    }

    // холмы не мешают: рельеф срезается автоматически (за деньги), если других помех нет
    let level: number[] | undefined;
    if (cfg.terraform.autoLevel && reasons.size === 1 && reasons.has('err.terrain') && hillSamples.length) {
      level = this.levelVertices(hillSamples);
      if (level.length) reasons.clear();
      else level = undefined;
    }

    if (reasons.size) {
      const order = ['err.bounds', 'err.terrain', 'err.road.building', 'err.road.angle', 'err.road.close'];
      return { ...plan, ok: false, reasonKey: order.find((k) => reasons.has(k)), blockers, crossings };
    }

    const cost = (length / cfg.roads.costUnit) * type.cost + (waterLen / cfg.roads.costUnit) * type.cost * (cfg.roads.bridgeCostMul - 1);
    const levelCost = level ? level.length * cfg.terraform.costPerVertex : 0;
    return { ...plan, ok: true, cost: cost + levelCost, crossings, level, levelCost, blockers: level ? blockers : [] };
  }

  /** Вершины рельефа четырёх углов каждой клетки, в которую попали точки на холме. */
  levelVertices(samples: Vec2[]): number[] {
    const w = this._game.world;
    const n1 = w.size + 1;
    const set = new Set<number>();
    for (const p of samples) {
      const ci = Math.min(w.size - 1, Math.max(0, Math.floor(p.x / CELL)));
      const cj = Math.min(w.size - 1, Math.max(0, Math.floor(p.z / CELL)));
      for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) set.add((cj + dj) * n1 + ci + di);
    }
    return [...set].filter((k) => w.heights[k] > this._cfg.world.flatEpsilon);
  }

  /** Срезает рельеф: выбранные вершины становятся ровными, соседи плавно спускаются (край без обрыва). */
  applyLevel(verts: number[]): void {
    if (!verts.length) return;
    const game = this._game;
    const w = game.world;
    const n1 = w.size + 1;
    const eps = this._cfg.world.flatEpsilon;
    const own = new Set(verts);
    let i0 = Infinity;
    let j0 = Infinity;
    let i1 = -Infinity;
    let j1 = -Infinity;
    const touch = (i: number, j: number, h: number): void => {
      w.setVertexHeight(i, j, h);
      i0 = Math.min(i0, i);
      i1 = Math.max(i1, i);
      j0 = Math.min(j0, j);
      j1 = Math.max(j1, j);
    };
    for (const k of verts) touch(k % n1, Math.floor(k / n1), 0);
    for (const k of verts) {
      const i = k % n1;
      const j = Math.floor(k / n1);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 1 || nj < 1 || ni >= w.size || nj >= w.size) continue;
        const nk = nj * n1 + ni;
        if (own.has(nk) || w.heights[nk] <= eps) continue;
        touch(ni, nj, w.heights[nk] * 0.5);
        own.add(nk);
      }
    }
    w.reclassify(i0, j0, i1, j1);
    game.bus.emit('terrain:changed');
  }

  /** Строит дорогу по плану: узлы, рёбра, пересечения, клетки зонирования. */
  buildRoad(plan: RoadPlan): PlaceResult {
    if (!plan.ok) return { ok: false, reasonKey: plan.reasonKey };
    const game = this._game;
    const world = game.world;
    const cfg = this._cfg;
    const type = game.roadTypes.require(plan.typeId);
    if (!game.get('economy').spend(plan.cost)) return fail('err.money');
    if (plan.level?.length) {
      this.applyLevel(plan.level);
      game.sfx('terraform');
    }
    const graph = world.graph;

    const nodeFor = (snap: RoadSnap): RoadNode => {
      if (snap.kind === 'node') return graph.nodes.get(snap.node!)!;
      if (snap.kind === 'edge' && graph.edges.has(snap.edge!)) return graph.splitEdge(snap.edge!, snap.x, snap.z).node;
      return graph.addNode(snap.x, snap.z);
    };
    const startNode = nodeFor(plan.start);
    // конец может лежать на том же ребре, что уже разрезано; ищем заново по координатам
    let endNode: RoadNode;
    if (plan.end.kind === 'edge') {
      const near = graph.nearestNode(plan.end.x, plan.end.z, cfg.roads.junctionMerge);
      if (near) endNode = near;
      else {
        const hit = graph.nearest(plan.end.x, plan.end.z, 3);
        endNode = hit ? graph.splitEdge(hit.edge.id, plan.end.x, plan.end.z).node : graph.addNode(plan.end.x, plan.end.z);
      }
    } else endNode = nodeFor(plan.end);

    const waypoints: { s: number; node: RoadNode }[] = [{ s: 0, node: startNode }];
    for (const c of plan.crossings) {
      let node: RoadNode | null = graph.nearestNode(c.x, c.z, cfg.roads.junctionMerge);
      if (!node) {
        const hit = graph.nearest(c.x, c.z, 2.5);
        if (!hit) continue;
        node = graph.splitEdge(hit.edge.id, c.x, c.z).node;
      }
      const last = waypoints[waypoints.length - 1];
      if (node.id === last.node.id) continue;
      waypoints.push({ s: c.s, node });
    }
    const total = plan.length;
    const last = waypoints[waypoints.length - 1];
    if (endNode.id === last.node.id) waypoints.pop();
    waypoints.push({ s: total, node: endNode });

    const cum = [0];
    for (let i = 1; i < plan.pts.length; i++) cum.push(cum[i - 1] + dist(plan.pts[i - 1], plan.pts[i]));
    const created: RoadEdge[] = [];
    for (let k = 0; k < waypoints.length - 1; k++) {
      const w0 = waypoints[k];
      const w1 = waypoints[k + 1];
      const piece = slicePolyline(plan.pts, cum, w0.s, w1.s, w0.node, w1.node);
      created.push(...this._addPieces(piece, w0.node, w1.node, type));
    }

    for (const e of created) pruneCellsNear(world, e, cfg);
    for (const e of created) generateCells(world, e, cfg);
    game.bus.emit('roads:changed');
    game.bus.emit('zones:changed');
    game.sfx('road');
    return { ok: true };
  }

  private _addPieces(pts: Vec2[], a: RoadNode, b: RoadNode, type: { index: number; width: number; access: boolean; oneway: boolean }): RoadEdge[] {
    const world = this._game.world;
    const cfg = this._cfg;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    const len = cum[cum.length - 1];
    const k = Math.max(1, Math.ceil(len / cfg.roads.maxSegmentLength));
    const out: RoadEdge[] = [];
    let prev = a;
    let prevS = 0;
    for (let i = 1; i <= k; i++) {
      const s1 = (len * i) / k;
      const node = i === k ? b : world.graph.addNode(pointAtLength(pts, cum, s1).x, pointAtLength(pts, cum, s1).z);
      const seg = slicePolyline(pts, cum, prevS, s1, prev, node);
      const bridge = seg.some((p) => world.terrainAt(p.x, p.z) === Terrain.Water);
      out.push(world.graph.addEdge(prev.id, node.id, seg, { type: type.index, hw: type.width / 2, access: type.access, bridge, oneway: type.oneway }));
      prev = node;
      prevS = s1;
    }
    return out;
  }

  /** Достраивает недостающие клетки зонирования вдоль рёбер рядом с областью (после сноса дорог). */
  regenerateCellsNear(x: number, z: number, r: number): void {
    const world = this._game.world;
    const seen = new Set<number>();
    for (const e of world.graph.edgesNear(x, z, r)) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      generateCells(world, e, this._cfg);
    }
  }

  // ================= зоны =================

  /** Клетки под кистью. */
  cellsInBrush(x: number, z: number, r: number): ZoneCell[] {
    return this._game.world.zones.near(x, z, r);
  }

  /** zoneId = null — снять зонирование. Возвращает число изменённых клеток. */
  paintZone(x: number, z: number, r: number, zoneId: string | null): { ok: boolean; changed: number; reasonKey?: string } {
    const game = this._game;
    const zone = zoneId ? game.zoneTypes.require(zoneId) : null;
    const target = zone ? zone.index + 1 : 0;
    const cells = this.cellsInBrush(x, z, r).filter((c) => c.zone !== target && (target === 0 || !c.building));
    if (!cells.length) return { ok: false, changed: 0 };
    const cost = zone ? cells.length * zone.cost : 0;
    if (!game.get('economy').spend(cost)) return { ok: false, changed: 0, reasonKey: 'err.money' };
    for (const c of cells) {
      if (!zone && c.building) {
        const b = game.world.buildings.get(c.building);
        if (b) this.removeBuilding(b);
      }
      c.zone = target;
    }
    game.bus.emit('zones:changed');
    game.sfx(zone ? 'zone' : 'bulldoze');
    return { ok: true, changed: cells.length };
  }

  // ================= службы =================

  serviceObb(defId: string, x: number, z: number, rot: number): Obb {
    const d = this._game.services.require(defId);
    return { x, z, hw: (d.size[0] * CELL) / 2, hd: (d.size[1] * CELL) / 2, rot };
  }

  /** Положение службы рядом с дорогой: фасадом к ближайшей дороге, вплотную к краю. */
  snapService(defId: string, x: number, z: number): ServiceSpot {
    const world = this._game.world;
    const d = this._game.services.require(defId);
    const hit = world.graph.nearest(x, z, 40, (e) => e.access);
    if (!hit) return { x, z, rot: 0, snapped: false };
    const side = Math.sign(hit.tx * (z - hit.z) - hit.tz * (x - hit.x)) || 1;
    const ox = -hit.tz * side;
    const oz = hit.tx * side;
    const hd = (d.size[1] * CELL) / 2;
    const off = hit.edge.hw + hd + 0.6;
    return { x: hit.x + ox * off, z: hit.z + oz * off, rot: yawOf(-ox, -oz), snapped: true };
  }

  /** Вершины рельефа, которые придётся срезать под основание службы. */
  serviceCut(defId: string, x: number, z: number, rot: number): number[] {
    const world = this._game.world;
    if (!this._cfg.terraform.autoLevel) return [];
    const o = this.serviceObb(defId, x, z, rot);
    const c = Math.cos(o.rot);
    const s = Math.sin(o.rot);
    const pts: Vec2[] = [];
    for (let u = -o.hw; u <= o.hw + 0.01; u += CELL / 2) {
      for (let v = -o.hd; v <= o.hd + 0.01; v += CELL / 2) pts.push({ x: o.x + c * u + s * v, z: o.z - s * u + c * v });
    }
    return this.levelVertices(pts.filter((p) => world.terrainAt(p.x, p.z) === Terrain.Blocked));
  }

  canPlaceService(defId: string, x: number, z: number, rot: number): PlaceResult {
    const game = this._game;
    const world = game.world;
    const def = game.services.require(defId);
    const obb = this.serviceObb(defId, x, z, rot);
    const reach = Math.max(obb.hw, obb.hd) + 20;
    if (!world.inBounds(x, z, this._cfg.world.edgeMargin)) return fail('err.bounds');
    const ft = world.footprintTerrain(obb);
    if (ft === Terrain.Water || (ft === Terrain.Blocked && !this._cfg.terraform.autoLevel)) return fail('err.terrain');
    for (const e of world.graph.edgesNear(x, z, reach)) {
      if (polyDistToObb(e.pts, obb) < e.hw + 0.2) return fail('err.occupied');
    }
    for (const b of world.buildingsNear(x, z, reach)) {
      if (obbOverlap(obb, world.obbOf(b))) return fail('err.occupied');
    }
    if (def.needsRoad) {
      const hit = world.graph.nearest(x, z, reach, (e) => e.access);
      if (!hit || polyDistToObb(hit.edge.pts, obb) > hit.edge.hw + 3) return fail('err.needRoad');
    }
    return { ok: true };
  }

  placeService(defId: string, x: number, z: number, rot: number): PlaceResult {
    const game = this._game;
    const def = game.services.require(defId);
    const check = this.canPlaceService(defId, x, z, rot);
    if (!check.ok) return check;
    const level = this.serviceCut(defId, x, z, rot);
    if (!game.get('economy').spend(def.cost + level.length * this._cfg.terraform.costPerVertex)) return fail('err.money');
    if (level.length) this.applyLevel(level);
    const b = this.createBuilding('service', defId, x, z, rot, def.size[0] * CELL, def.size[1] * CELL);
    // убираем пустые клетки зонирования под зданием
    const obb = this.serviceObb(defId, x, z, rot);
    for (const c of game.world.zones.near(x, z, Math.hypot(obb.hw, obb.hd) + CELL)) {
      if (!c.building && obbDist(obb, c) < CELL / 2) game.world.zones.remove(c.id);
    }
    this.addBuilding(b);
    game.bus.emit('zones:changed');
    game.sfx('build');
    return { ok: true };
  }

  /** Уровень службы: 1 + число улучшений. */
  serviceLevel(b: Building): { level: number; max: number } {
    const d = this._game.services.require(b.defId);
    const n = d.upgrades?.length ?? 0;
    let have = 0;
    for (let i = 0; i < n; i++) if (b.up & (1 << i)) have++;
    return { level: 1 + have, max: 1 + n };
  }

  /** Купить улучшение службы: меняет характеристики и внешний вид. */
  upgradeService(b: Building, upgradeId: string): PlaceResult {
    const game = this._game;
    if (b.kind !== 'service') return fail('err.upgrade.none');
    const def = game.services.require(b.defId);
    const i = (def.upgrades ?? []).findIndex((u) => u.id === upgradeId);
    if (i < 0) return fail('err.upgrade.none');
    if (b.up & (1 << i)) return fail('err.upgrade.done');
    const u = def.upgrades![i];
    if (!game.get('economy').spend(u.cost)) return fail('err.money');
    b.up |= 1 << i;
    this.applyStats(b);
    this.updateAccess(b);
    game.bus.emit('building:updated', b);
    game.bus.emit('economy:changed');
    game.sfx('levelup');
    game.message('msg.upgraded', { name: t(`upgrade.${def.id}.${u.id}.name`) }, 'good');
    return { ok: true };
  }

  // ================= остановки =================

  placeStop(x: number, z: number): PlaceResult {
    const game = this._game;
    const world = game.world;
    const hit = world.graph.nearest(x, z, this._cfg.roads.snapRadius + 6, (e) => e.access);
    if (!hit) return fail('err.stop.road');
    const merge = this._cfg.transit.stopMergeDistance;
    if (world.stops.some((s) => Math.hypot(s.x - hit.x, s.z - hit.z) < merge)) return fail('err.stop.exists');
    if (!game.get('economy').spend(this._cfg.economy.stopCost)) return fail('err.money');
    world.stops.push({ id: world.newId(), edge: hit.edge.id, s: hit.s, x: hit.x, z: hit.z });
    game.bus.emit('stops:changed');
    game.sfx('stop');
    return { ok: true };
  }

  removeStop(id: number): void {
    const world = this._game.world;
    if (!world.stops.some((s) => s.id === id)) return;
    world.stops = world.stops.filter((s) => s.id !== id);
    this._game.bus.emit('stops:changed');
    this._game.sfx('bulldoze');
  }

  // ================= снос =================

  /** Всё, что попадает в прямоугольник: здания, дороги, остановки, зоны. */
  bulldozeRect(x0: number, z0: number, x1: number, z1: number): { buildings: number; edges: number; cells: number } {
    const game = this._game;
    const world = game.world;
    const [minX, maxX] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [minZ, maxZ] = [Math.min(z0, z1), Math.max(z0, z1)];
    const inside = (p: Vec2): boolean => p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const rad = Math.hypot(maxX - minX, maxZ - minZ) / 2 + 30;

    let buildings = 0;
    for (const b of world.buildingsNear(cx, cz, rad)) {
      if (inside(b)) {
        this.removeBuilding(b);
        buildings++;
      }
    }
    const doomed: RoadEdge[] = [];
    for (const e of world.graph.edgesNear(cx, cz, rad)) if (e.pts.some(inside)) doomed.push(e);
    for (const e of doomed) world.graph.removeEdge(e.id);
    world.stops = world.stops.filter((s) => !doomed.some((e) => e.id === s.edge) && !inside(s));

    let cells = 0;
    for (const c of world.zones.near(cx, cz, rad)) {
      if (!inside(c)) continue;
      if (c.zone || c.building) {
        const b = c.building ? world.buildings.get(c.building) : undefined;
        if (b) this.removeBuilding(b);
        c.zone = 0;
        cells++;
      }
    }
    if (doomed.length) {
      this.refreshAccess();
      this.regenerateCellsNear(cx, cz, rad);
      game.bus.emit('roads:changed');
      game.bus.emit('stops:changed');
    }
    game.bus.emit('zones:changed');
    if (buildings || doomed.length || cells) game.sfx('bulldoze');
    return { buildings, edges: doomed.length, cells };
  }

  /**
   * После изменения графа: пересчитывает доступ клеток и зданий к дорогам,
   * удаляет клетки (и их здания), оставшиеся без дороги, и перепривязывает остановки.
   */
  refreshAccess(): void {
    const game = this._game;
    const world = game.world;
    for (const c of refreshCellAccess(world, this._cfg)) {
      const b = c.building ? world.buildings.get(c.building) : undefined;
      if (b) this.removeBuilding(b);
      world.zones.remove(c.id);
    }
    for (const b of world.list()) this.updateAccess(b);
    const merge = this._cfg.roads.snapRadius;
    world.stops = world.stops.flatMap((s) => {
      const hit = world.graph.nearest(s.x, s.z, merge, (e) => e.access);
      return hit ? [{ ...s, edge: hit.edge.id, s: hit.s }] : [];
    });
  }

  // ================= рельеф =================

  /** Нельзя ли менять рельеф в точке: рядом дорога, здание или размеченная клетка. */
  isTerrainProtected(x: number, z: number): boolean {
    const w = this._game.world;
    const p = this._cfg.terraform.protect;
    if (w.graph.clearance(x, z, p) < p) return true;
    for (const b of w.buildingsNear(x, z, p + 12)) if (obbDist(w.obbOf(b), { x, z }) < p) return true;
    for (const c of w.zones.near(x, z, p)) if (c.zone || c.building) return true;
    return false;
  }

  /** Вершины рельефа под кистью с весами и признаком защиты. */
  terrainBrush(x: number, z: number, r: number): { i: number; j: number; w: number; protectedPoint: boolean }[] {
    const w = this._game.world;
    const out: { i: number; j: number; w: number; protectedPoint: boolean }[] = [];
    const n = w.size;
    for (let j = Math.max(1, Math.floor((z - r) / CELL)); j <= Math.min(n - 1, Math.ceil((z + r) / CELL)); j++) {
      for (let i = Math.max(1, Math.floor((x - r) / CELL)); i <= Math.min(n - 1, Math.ceil((x + r) / CELL)); i++) {
        const d = Math.hypot(i * CELL - x, j * CELL - z);
        if (d > r) continue;
        const t = 1 - d / r;
        out.push({ i, j, w: t * t * (3 - 2 * t), protectedPoint: this.isTerrainProtected(i * CELL, j * CELL) });
      }
    }
    return out;
  }

  /**
   * Лепка рельефа кистью: raise/lower — поднять/опустить, flatten — выровнять до уровня земли (0), smooth — сгладить.
   * Вершины рядом с дорогами, зданиями и зонами не меняются.
   */
  terraform(mode: 'raise' | 'lower' | 'flatten' | 'smooth', x: number, z: number, r: number): { ok: boolean; changed: number; reasonKey?: string } {
    const game = this._game;
    const w = game.world;
    const c = this._cfg.terraform;
    const n = w.size + 1;
    const edits: { i: number; j: number; h: number }[] = [];
    for (const v of this.terrainBrush(x, z, r)) {
      if (v.protectedPoint) continue;
      const h0 = w.heights[v.j * n + v.i];
      let h = h0;
      if (mode === 'raise') h += c.step * v.w;
      else if (mode === 'lower') h -= c.step * v.w;
      else if (mode === 'flatten') {
        h = h0 + (0 - h0) * Math.min(1, v.w * 1.5);
        if (Math.abs(h) < 0.3 && v.w > 0.3) h = 0;
      } else {
        const avg = (w.heights[v.j * n + v.i - 1] + w.heights[v.j * n + v.i + 1] + w.heights[(v.j - 1) * n + v.i] + w.heights[(v.j + 1) * n + v.i]) / 4;
        h = h0 + (avg - h0) * 0.6 * v.w;
        if (Math.abs(h) < 0.05) h = 0;
      }
      h = Math.min(c.maxHeight, Math.max(c.minHeight, h));
      if (Math.abs(h) < 0.04) h = 0;
      if (Math.abs(h - h0) > 0.005) edits.push({ i: v.i, j: v.j, h });
    }
    if (!edits.length) return { ok: false, changed: 0 };
    if (!game.get('economy').spend(edits.length * c.costPerVertex)) return { ok: false, changed: 0, reasonKey: 'err.money' };
    let i0 = Infinity;
    let j0 = Infinity;
    let i1 = -Infinity;
    let j1 = -Infinity;
    for (const e of edits) {
      w.setVertexHeight(e.i, e.j, e.h);
      i0 = Math.min(i0, e.i);
      i1 = Math.max(i1, e.i);
      j0 = Math.min(j0, e.j);
      j1 = Math.max(j1, e.j);
    }
    w.reclassify(i0, j0, i1, j1);
    // клетки зонирования, оказавшиеся на неровном месте, пропадают
    for (const cell of w.zones.near(x, z, r + CELL * 2)) {
      if (!cell.building && w.footprintTerrain({ x: cell.x, z: cell.z, hw: CELL / 2 - 0.1, hd: CELL / 2 - 0.1, rot: cell.rot }) !== Terrain.Land) w.zones.remove(cell.id);
    }
    this.regenerateCellsNear(x, z, r + 40);
    game.bus.emit('terrain:changed');
    game.bus.emit('zones:changed');
    game.sfx('terraform');
    return { ok: true, changed: edits.length };
  }

  // ================= светофоры =================

  /** Узел-перекрёсток (≥3 дорог) рядом с точкой. */
  junctionNear(x: number, z: number): RoadNode | null {
    const g = this._game.world.graph;
    const node = g.nearestNode(x, z, this._cfg.roads.snapRadius + 6);
    return node && node.edges.length >= 3 ? node : null;
  }

  /** Поставить (on = true) или убрать светофор на перекрёстке. */
  setTrafficLight(x: number, z: number, on: boolean): PlaceResult {
    const game = this._game;
    const node = this.junctionNear(x, z);
    if (!node) return fail('err.light.junction');
    if (node.light === on) return fail(on ? 'err.light.exists' : 'err.light.none');
    if (on && !game.get('economy').spend(this._cfg.roads.lightCost)) return fail('err.money');
    node.light = on;
    game.world.graph.version++;
    game.bus.emit('roads:changed');
    game.sfx(on ? 'build' : 'bulldoze');
    return { ok: true };
  }

  // ================= здания =================

  /** Новая постройка на клетке зонирования. */
  spawnOnCell(cell: ZoneCell, zoneId: string): Building {
    const b = this.createBuilding('zone', zoneId, cell.x, cell.z, cell.rot, CELL - 1, CELL - 1, cell.id);
    b.access = cell.edge;
    b.accessS = cell.s;
    this.addBuilding(b);
    return b;
  }

  createBuilding(kind: 'zone' | 'service', defId: string, x: number, z: number, rot: number, w: number, d: number, cell = 0): Building {
    const g = this._game;
    const b: Building = {
      id: g.world.newId(),
      kind,
      defId,
      zone: kind === 'zone' ? defId : '',
      level: 1,
      variant: Math.floor(Math.random() * g.config.render.zoneVariants),
      x,
      z,
      rot,
      w,
      d,
      cell,
      access: 0,
      accessS: 0,
      comp: -1,
      pop: 0,
      cap: 0,
      jobs: 0,
      workers: 0,
      powerNeed: 0,
      waterNeed: 0,
      powerOut: 0,
      waterOut: 0,
      upkeep: 0,
      powered: false,
      watered: false,
      happiness: 0.5,
      goods: 0.5,
      abandoned: false,
      outage: 0,
      decay: 0,
      fire: 0,
      garbage: 0,
      dead: 0,
      stored: 0,
      incident: 0,
      up: 0,
    };
    this.applyStats(b);
    return b;
  }

  /** Пересчитывает вместимость/потребности по определению и уровню. */
  applyStats(b: Building): void {
    const g = this._game;
    if (b.kind === 'zone') {
      const z = g.zoneTypes.require(b.zone);
      const lv = z.levels[b.level - 1];
      b.cap = z.housing ? lv.capacity : 0;
      b.jobs = z.housing ? 0 : lv.capacity;
      b.powerNeed = lv.capacity * z.powerPer;
      b.waterNeed = lv.capacity * z.waterPer;
    } else {
      const d = effectiveDef(g.services.require(b.defId), b.up);
      b.jobs = d.jobs;
      b.powerNeed = d.powerNeed;
      b.waterNeed = d.waterNeed;
      b.powerOut = d.provides?.power ?? 0;
      b.waterOut = d.provides?.water ?? 0;
      b.upkeep = d.upkeep;
      b.powered = d.powerNeed === 0;
      b.watered = d.waterNeed === 0;
    }
  }

  /** Находит ближайшую дорогу с доступом для здания-службы (zone-здания берут доступ у своей клетки). */
  updateAccess(b: Building): void {
    const world = this._game.world;
    if (b.cell) {
      const c = world.zones.cells.get(b.cell);
      b.access = c ? c.edge : 0;
      b.accessS = c ? c.s : 0;
      return;
    }
    const r = Math.max(b.w, b.d) / 2 + 20;
    const hit = world.graph.nearest(b.x, b.z, r, (e) => e.access);
    const near = hit && polyDistToObb(hit.edge.pts, world.obbOf(b)) <= hit.edge.hw + 3;
    b.access = near ? hit!.edge.id : 0;
    b.accessS = near ? hit!.s : 0;
  }

  addBuilding(b: Building): void {
    const world = this._game.world;
    this.updateAccess(b);
    world.registerBuilding(b);
    if (b.cell) {
      const c = world.zones.cells.get(b.cell);
      if (c) c.building = b.id;
    }
    this._game.bus.emit('building:added', b);
  }

  removeBuilding(b: Building): void {
    const world = this._game.world;
    if (b.cell) {
      const c = world.zones.cells.get(b.cell);
      if (c && c.building === b.id) c.building = 0;
    }
    world.unregisterBuilding(b);
    this._game.bus.emit('building:removed', b);
  }

  /** Меняет уровень здания (апгрейд/даунгрейд). */
  setLevel(b: Building, level: number): void {
    b.level = level;
    b.variant = Math.floor(Math.random() * this._game.config.render.zoneVariants);
    this.applyStats(b);
    this._game.bus.emit('building:updated', b);
    this._game.sfx(level > 1 ? 'levelup' : 'tick');
  }
}

function norm2(to: Vec2, from: Vec2): Vec2 {
  const l = Math.hypot(to.x - from.x, to.z - from.z) || 1;
  return { x: (to.x - from.x) / l, z: (to.z - from.z) / l };
}

function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

/** Участок ломаной между длинами s0 и s1; концы заменяются на координаты узлов. */
function slicePolyline(pts: Vec2[], cum: number[], s0: number, s1: number, n0: { x: number; z: number }, n1: { x: number; z: number }): Vec2[] {
  const out: Vec2[] = [{ x: n0.x, z: n0.z }];
  for (let i = 0; i < pts.length; i++) {
    if (cum[i] > s0 + 0.5 && cum[i] < s1 - 0.5) out.push({ x: pts[i].x, z: pts[i].z });
  }
  out.push({ x: n1.x, z: n1.z });
  return out;
}
