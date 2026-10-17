import { describe, expect, it } from 'vitest';
import { RoadGraph } from '../src/world/RoadGraph';

const init = { type: 0, hw: 4, access: true, bridge: false };
function line(g: RoadGraph, x0: number, z0: number, x1: number, z1: number) {
  const a = g.addNode(x0, z0);
  const b = g.addNode(x1, z1);
  const e = g.addEdge(a.id, b.id, [{ x: x0, z: z0 }, { x: x1, z: z1 }], init);
  return { a, b, e };
}

describe('RoadGraph', () => {
  it('создаёт узлы и рёбра с длиной', () => {
    const g = new RoadGraph();
    const { a, b, e } = line(g, 0, 0, 30, 40);
    expect(e.len).toBeCloseTo(50);
    expect(a.edges).toEqual([e.id]);
    expect(b.edges).toEqual([e.id]);
  });

  it('делит ребро: первая часть сохраняет id, новый узел связывает обе', () => {
    const g = new RoadGraph();
    const { a, b, e } = line(g, 0, 0, 40, 0);
    const r = g.splitEdge(e.id, 10, 3);
    expect(r.first.id).toBe(e.id);
    expect(r.first.len).toBeCloseTo(10);
    expect(r.second.len).toBeCloseTo(30);
    expect(r.node.x).toBeCloseTo(10);
    expect(r.node.z).toBeCloseTo(0);
    expect(r.first.a).toBe(a.id);
    expect(r.first.b).toBe(r.node.id);
    expect(r.second.a).toBe(r.node.id);
    expect(r.second.b).toBe(b.id);
    expect(r.node.edges).toHaveLength(2);
    expect(b.edges).toEqual([r.second.id]);
    expect(r.first.rev).toBeGreaterThan(0);
  });

  it('ищет ближайшую дорогу и узел', () => {
    const g = new RoadGraph();
    line(g, 0, 0, 40, 0);
    const hit = g.nearest(20, 5, 10)!;
    expect(hit.d).toBeCloseTo(5);
    expect(hit.s).toBeCloseTo(20);
    expect(g.nearest(20, 50, 10)).toBeNull();
    expect(g.nearestNode(3, 2, 5)).not.toBeNull();
    expect(g.nearestNode(20, 2, 5)).toBeNull();
  });

  it('учитывает фильтр и считает зазор с учётом ширины', () => {
    const g = new RoadGraph();
    line(g, 0, 0, 40, 0);
    expect(g.nearest(20, 2, 10, () => false)).toBeNull();
    expect(g.clearance(20, 10, 10)).toBeCloseTo(6);
    expect(g.clearance(20, 1, 10)).toBeLessThan(0);
  });

  it('удаляет ребро и осиротевшие узлы', () => {
    const g = new RoadGraph();
    const { e } = line(g, 0, 0, 40, 0);
    g.removeEdge(e.id);
    expect(g.edges.size).toBe(0);
    expect(g.nodes.size).toBe(0);
  });

  it('находит компоненты связности', () => {
    const g = new RoadGraph();
    const l1 = line(g, 0, 0, 40, 0);
    const l2 = line(g, 0, 100, 40, 100);
    const l3 = g.addEdge(l1.b.id, g.addNode(80, 0).id, [{ x: 40, z: 0 }, { x: 80, z: 0 }], init);
    const { node, count } = g.components();
    expect(count).toBe(2);
    expect(node.get(l1.a.id)).toBe(node.get(l3.b));
    expect(node.get(l1.a.id)).not.toBe(node.get(l2.a.id));
  });

  it('растёт версия при изменениях', () => {
    const g = new RoadGraph();
    const v0 = g.version;
    const { e } = line(g, 0, 0, 10, 0);
    expect(g.version).toBeGreaterThan(v0);
    const v1 = g.version;
    g.removeEdge(e.id);
    expect(g.version).toBeGreaterThan(v1);
  });
});
