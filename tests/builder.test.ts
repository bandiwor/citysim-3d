import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { coreFeature, disastersFeature, roadsFeature, servicesFeature, trafficFeature, zonesFeature } from '../src/features';
import { flatTerrain, Terrain } from '../src/world/Terrain';
import { createGame, road, settle } from './helpers';

const cellsNear = (g: Game, x: number, z: number, r: number) => g.world.zones.near(x, z, r);

describe('Builder: дороги', () => {
  it('планирует прямую дорогу и считает цену по длине', () => {
    const g = createGame();
    const b = g.builder;
    const plan = b.planRoad(b.snap(40, 100), b.snap(140, 100), null, 'street');
    expect(plan.ok).toBe(true);
    expect(plan.length).toBeCloseTo(100);
    expect(plan.cost).toBeCloseTo((100 / g.config.roads.costUnit) * g.roadTypes.require('street').cost);
  });

  it('делит длинную дорогу на рёбра не длиннее лимита и строит клетки по обе стороны', () => {
    const g = createGame();
    expect(road(g, 40, 100, 140, 100)).toBe(true);
    const edges = [...g.world.graph.edges.values()];
    expect(edges).toHaveLength(3);
    for (const e of edges) expect(e.len).toBeLessThanOrEqual(g.config.roads.maxSegmentLength + 0.5);
    expect(g.world.graph.nodes.size).toBe(4);
    const cells = g.world.zones.list();
    // 3 ряда × 2 стороны × ~12 клеток вдоль 100 ед.
    expect(cells.length).toBeGreaterThan(60);
    expect(cells.some((c) => c.row === 2)).toBe(true);
    expect(cells.some((c) => c.z < 100)).toBe(true);
    expect(cells.some((c) => c.z > 100)).toBe(true);
  });

  it('клетки лицом (+Z) повёрнуты к дороге и не перекрывают проезжую часть', () => {
    const g = createGame();
    road(g, 40, 100, 140, 100);
    for (const c of g.world.zones.list()) {
      const fx = Math.sin(c.rot);
      const fz = Math.cos(c.rot);
      const toward = Math.sign(100 - c.z);
      expect(Math.sign(fz)).toBe(toward);
      expect(Math.abs(fx)).toBeLessThan(0.01);
      expect(Math.abs(c.z - 100)).toBeGreaterThan(4 + 3.9);
    }
  });

  it('пересечение создаёт перекрёсток, делит рёбра и убирает клетки на проезжей части', () => {
    const g = createGame();
    road(g, 40, 100, 140, 100);
    expect(road(g, 90, 40, 90, 160)).toBe(true);
    const junction = [...g.world.graph.nodes.values()].find((n) => n.edges.length === 4);
    expect(junction).toBeDefined();
    expect(Math.hypot(junction!.x - 90, junction!.z - 100)).toBeLessThan(1);
    for (const c of g.world.zones.list()) {
      for (const e of g.world.graph.edgesNear(c.x, c.z, 20)) {
        let d = Infinity;
        for (let i = 0; i < e.pts.length - 1; i++) {
          const a = e.pts[i];
          const b = e.pts[i + 1];
          const l2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2 || 1;
          const t = Math.max(0, Math.min(1, ((c.x - a.x) * (b.x - a.x) + (c.z - a.z) * (b.z - a.z)) / l2));
          d = Math.min(d, Math.hypot(c.x - (a.x + (b.x - a.x) * t), c.z - (a.z + (b.z - a.z) * t)));
        }
        expect(d).toBeGreaterThan(e.hw + 2);
      }
    }
  });

  it('привязка: к узлу, к середине дороги (разрезание) и свободная точка', () => {
    const g = createGame();
    road(g, 40, 100, 80, 100);
    expect(g.builder.snap(42, 103).kind).toBe('node');
    const mid = g.builder.snap(60, 102);
    expect(mid.kind).toBe('edge');
    expect(mid.z).toBeCloseTo(100);
    expect(g.builder.snap(60, 150).kind).toBe('free');
  });

  it('дорога из середины существующей разрезает её и подключается', () => {
    const g = createGame();
    road(g, 40, 100, 100, 100);
    expect(road(g, 70, 100, 70, 160)).toBe(true);
    const junction = [...g.world.graph.nodes.values()].find((n) => n.edges.length === 3);
    expect(junction).toBeDefined();
  });

  it('отказывает: слишком коротко, тот же узел, за картой', () => {
    const g = createGame();
    const b = g.builder;
    expect(b.planRoad(b.snap(40, 40), b.snap(44, 40), null, 'street').reasonKey).toBe('err.road.short');
    road(g, 40, 100, 80, 100);
    const a = b.snap(40, 100);
    expect(b.planRoad(a, a, null, 'street').ok).toBe(false);
    expect(b.planRoad(b.snap(40, 40), b.snap(-100, 40), null, 'street').reasonKey).toBe('err.bounds');
  });

  it('не даёт строить параллельно вплотную к другой дороге и под острым углом', () => {
    const g = createGame();
    road(g, 40, 100, 140, 100);
    const b = g.builder;
    expect(b.planRoad(b.snap(40, 104), b.snap(140, 104), null, 'street').reasonKey).toBe('err.road.close');
    // почти параллельный пересекающий путь
    expect(b.planRoad(b.snap(60, 94), b.snap(130, 106), null, 'street').ok).toBe(false);
  });

  it('не даёт пробить здание', () => {
    const g = createGame();
    road(g, 40, 100, 140, 100);
    const spot = g.builder.snapService('police', 90, 112);
    expect(g.builder.placeService('police', spot.x, spot.z, spot.rot).ok).toBe(true);
    const b = g.builder;
    const plan = b.planRoad(b.snap(spot.x, 60), b.snap(spot.x, 200), null, 'street');
    expect(plan.ok).toBe(false);
    expect(plan.reasonKey).toBe('err.road.building');
  });

  it('не строит на холмах, но разрешает мост через воду', () => {
    const size = 40;
    const t = flatTerrain(size);
    for (let y = 0; y < size; y++) {
      t.terrain[y * size + 10] = Terrain.Blocked;
      t.terrain[y * size + 20] = Terrain.Water;
    }
    const g = new Game({ seed: 1, terrain: t });
    g.use(roadsFeature).use(zonesFeature).use(servicesFeature).use(trafficFeature).use(coreFeature).use(disastersFeature);
    g.start();
    g.get('economy').money = 1e9;
    const b = g.builder;
    expect(b.planRoad(b.snap(40, 100), b.snap(120, 100), null, 'street').reasonKey).toBe('err.terrain');
    const bridge = b.planRoad(b.snap(100, 100), b.snap(220, 100), null, 'street');
    expect(bridge.ok).toBe(true);
    expect(bridge.cost).toBeGreaterThan((bridge.length / 8) * 12);
    b.buildRoad(bridge);
    expect([...g.world.graph.edges.values()].some((e) => e.bridge)).toBe(true);
  });

  it('списывает деньги и отказывает при нехватке', () => {
    const g = createGame({ money: 50 });
    const b = g.builder;
    const plan = b.planRoad(b.snap(40, 100), b.snap(140, 100), null, 'street');
    const r = b.buildRoad(plan);
    expect(r.ok).toBe(false);
    expect(r.reasonKey).toBe('err.money');
    expect(g.world.graph.edges.size).toBe(0);
  });

  it('строит кривую, а дороги без доступа (магистраль) не порождают клетки', () => {
    const g = createGame();
    const b = g.builder;
    const plan = b.planRoad(b.snap(40, 100), b.snap(140, 100), { x: 90, z: 170 }, 'street');
    expect(plan.ok).toBe(true);
    expect(Math.max(...plan.pts.map((p) => p.z))).toBeGreaterThan(130);
    expect(plan.length).toBeGreaterThan(105);
    const g2 = createGame();
    road(g2, 40, 100, 140, 100, 'highway');
    expect(g2.world.zones.list()).toHaveLength(0);
  });
});

describe('Builder: зоны', () => {
  it('красит клетки кистью, берёт деньги и снимает зону', () => {
    const g = createGame({ money: 1000 });
    road(g, 40, 100, 140, 100);
    const before = g.get('economy').money;
    const r = g.builder.paintZone(90, 112, 14, 'res');
    expect(r.ok).toBe(true);
    expect(r.changed).toBeGreaterThan(2);
    expect(g.get('economy').money).toBe(before - r.changed * g.zoneTypes.require('res').cost);
    expect(cellsNear(g, 90, 112, 14).every((c) => c.zone === g.zoneTypes.require('res').index + 1)).toBe(true);
    expect(g.builder.paintZone(90, 112, 14, 'res').changed).toBe(0);
    expect(g.builder.paintZone(90, 112, 14, null).changed).toBe(r.changed);
  });

  it('не перекрашивает клетки со зданиями, но снятие зоны сносит здание', async () => {
    const g = createGame();
    road(g, 40, 100, 140, 100);
    g.builder.paintZone(90, 112, 10, 'res');
    const cell = g.world.zones.near(90, 112, 10)[0];
    const b = g.builder.spawnOnCell(cell, 'res');
    expect(cell.building).toBe(b.id);
    expect(g.builder.paintZone(cell.x, cell.z, 3, 'com').changed).toBe(0);
    g.builder.paintZone(cell.x, cell.z, 3, null);
    expect(g.world.buildings.has(b.id)).toBe(false);
    expect(cell.building).toBe(0);
  });
});

describe('Builder: службы, остановки, снос', () => {
  it('прижимает службу к дороге фасадом к ней и отвергает наложение на дорогу', () => {
    const g = createGame();
    road(g, 40, 100, 140, 100);
    const spot = g.builder.snapService('police', 90, 130);
    expect(spot.snapped).toBe(true);
    // фасад (+Z) смотрит на дорогу, т.е. к меньшему z
    expect(Math.cos(spot.rot)).toBeLessThan(-0.99);
    expect(spot.z).toBeGreaterThan(100);
    expect(g.builder.canPlaceService('police', spot.x, spot.z, spot.rot).ok).toBe(true);
    expect(g.builder.canPlaceService('police', 90, 100, 0).reasonKey).toBe('err.occupied');
    expect(g.builder.canPlaceService('police', 90, 190, 0).reasonKey).toBe('err.needRoad');
    expect(g.builder.canPlaceService('park', 90, 190, 0).ok).toBe(true);
  });

  it('служба убирает пустые клетки под собой и не ставится поверх другого здания', () => {
    const g = createGame();
    road(g, 40, 100, 140, 100);
    const spot = g.builder.snapService('clinic', 90, 112);
    const before = g.world.zones.list().length;
    expect(g.builder.placeService('clinic', spot.x, spot.z, spot.rot).ok).toBe(true);
    expect(g.world.zones.list().length).toBeLessThan(before);
    expect(g.builder.placeService('clinic', spot.x, spot.z, spot.rot).reasonKey).toBe('err.occupied');
  });

  it('ставит остановки только на дорогу и не дублирует', () => {
    const g = createGame();
    road(g, 40, 100, 140, 100);
    expect(g.builder.placeStop(90, 150).ok).toBe(false);
    expect(g.builder.placeStop(90, 102).ok).toBe(true);
    expect(g.builder.placeStop(92, 100).reasonKey).toBe('err.stop.exists');
    expect(g.world.stops).toHaveLength(1);
  });

  it('снос областью удаляет здания, дороги, остановки; осиротевшие клетки исчезают', async () => {
    const g = createGame();
    road(g, 40, 100, 140, 100);
    road(g, 90, 100, 90, 180);
    const spot = g.builder.snapService('police', 60, 112);
    g.builder.placeService('police', spot.x, spot.z, spot.rot);
    g.builder.placeStop(120, 100);
    await settle(g);
    const cellsBefore = g.world.zones.list().length;
    const r = g.builder.bulldozeRect(80, 130, 100, 190);
    expect(r.edges).toBeGreaterThan(0);
    expect(g.world.zones.list().length).toBeLessThan(cellsBefore);
    const r2 = g.builder.bulldozeRect(0, 0, 400, 400);
    expect(r2.buildings).toBe(1);
    expect(g.world.graph.edges.size).toBe(0);
    expect(g.world.stops).toHaveLength(0);
    expect(g.world.zones.list()).toHaveLength(0);
  });

  it('после сноса дороги регенерирует клетки вдоль соседней', async () => {
    const g = createGame();
    road(g, 40, 100, 140, 100);
    road(g, 90, 40, 90, 160);
    const before = g.world.zones.list().length;
    g.builder.bulldozeRect(85, 125, 95, 160);
    await settle(g);
    expect(g.world.zones.list().length).toBeGreaterThan(0);
    expect(g.world.zones.list().length).toBeLessThanOrEqual(before + 20);
  });
});
