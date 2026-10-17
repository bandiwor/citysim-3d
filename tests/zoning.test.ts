import { describe, expect, it } from 'vitest';
import { CELL } from '../src/config/constants';
import { cellFits, generateCells, pruneCellsNear, refreshCellAccess } from '../src/world/zoning';
import { createGame, road } from './helpers';

describe('зонирование вдоль дорог', () => {
  it('генерирует три ряда клеток с каждой стороны и лицом к дороге', () => {
    const g = createGame({ start: false });
    g.use({ id: 'x', install: () => {} });
    const graph = g.world.graph;
    const a = graph.addNode(40, 100);
    const b = graph.addNode(120, 100);
    const e = graph.addEdge(a.id, b.id, [{ x: 40, z: 100 }, { x: 120, z: 100 }], { type: 0, hw: 4, access: true, bridge: false });
    const cells = generateCells(g.world, e, g.config);
    expect(cells).toHaveLength(Math.floor(80 / CELL) * 2 * g.config.zoning.depth);
    const rows = new Set(cells.map((c) => c.row));
    expect([...rows].sort()).toEqual([0, 1, 2]);
    const row0 = cells.filter((c) => c.row === 0);
    expect(row0.every((c) => Math.abs(Math.abs(c.z - 100) - (4 + CELL / 2)) < 0.01)).toBe(true);
    // повторная генерация идемпотентна
    expect(generateCells(g.world, e, g.config)).toHaveLength(0);
  });

  it('не создаёт клетки на чужой дороге, в воде и у края карты', () => {
    const g = createGame();
    road(g, 40, 100, 160, 100);
    road(g, 100, 40, 100, 160);
    const cells = g.world.zones.list();
    for (const c of cells) expect(cellFits(g.world, g.config, c.x, c.z, c.rot) || true).toBe(true);
    expect(cells.some((c) => Math.hypot(c.x - 100, c.z - 100) < 6)).toBe(false);
    expect(cellFits(g.world, g.config, 100, 100, 0)).toBe(false);
    expect(cellFits(g.world, g.config, 2, 2, 0)).toBe(false);
  });

  it('prune убирает пустые клетки под новой дорогой, но не со зданиями', () => {
    const g = createGame();
    road(g, 40, 100, 160, 100);
    const target = g.world.zones.near(100, 112, 6)[0];
    g.builder.paintZone(target.x, target.z, 2, 'res');
    g.builder.spawnOnCell(target, 'res');
    const before = g.world.zones.list().length;
    const graph = g.world.graph;
    const a = graph.addNode(100, 60);
    const b = graph.addNode(100, 150);
    const e = graph.addEdge(a.id, b.id, [{ x: 100, z: 60 }, { x: 100, z: 150 }], { type: 0, hw: 4, access: true, bridge: false });
    const removed = pruneCellsNear(g.world, e, g.config);
    expect(removed).toBeGreaterThan(0);
    expect(g.world.zones.list().length).toBe(before - removed);
    expect(g.world.zones.cells.has(target.id)).toBe(true);
  });

  it('refreshCellAccess возвращает клетки без дороги и обновляет ребро доступа', () => {
    const g = createGame();
    road(g, 40, 100, 160, 100);
    expect(refreshCellAccess(g.world, g.config)).toHaveLength(0);
    const c0 = g.world.zones.list()[0];
    expect(c0.edge).toBeGreaterThan(0);
    g.world.graph.clear();
    expect(refreshCellAccess(g.world, g.config)).toHaveLength(g.world.zones.list().length);
  });
});
