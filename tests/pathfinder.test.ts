import { describe, expect, it } from 'vitest';
import { PathFinder } from '../src/workers/pathfinder';
import type { GraphSnapshot } from '../src/workers/protocol';

/** Мини-граф из списка рёбер [a, b, длина, скорость]. */
function graph(nodes: [number, number][], edges: [number, number, number, number][], version = 1): GraphSnapshot {
  return {
    version,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeX: Float32Array.from(nodes.map((n) => n[0])),
    nodeZ: Float32Array.from(nodes.map((n) => n[1])),
    edgeA: Int32Array.from(edges.map((e) => e[0])),
    edgeB: Int32Array.from(edges.map((e) => e[1])),
    edgeLen: Float32Array.from(edges.map((e) => e[2])),
    edgeSpeed: Float32Array.from(edges.map((e) => e[3])),
    edgeCap: Float32Array.from(edges.map(() => 10)),
    edgeOneway: new Uint8Array(edges.length),
    edgeIds: Int32Array.from(edges.map((_, i) => i + 100)),
    congestionPower: 2,
    minFlow: 0.05,
  };
}

const req = (fromEdge: number, fromS: number, toEdge: number, toS: number, version = 1) => ({ id: 1, version, fromEdge, fromS, toEdge, toS });

describe('PathFinder', () => {
  // 0 ─e0─ 1 ─e1─ 2 ─e2─ 3, плюс обход 0 ─e3─ 3 (короче по длине, но медленный)
  const nodes: [number, number][] = [[0, 0], [40, 0], [80, 0], [120, 0]];
  const edges: [number, number, number, number][] = [
    [0, 1, 40, 14],
    [1, 2, 40, 14],
    [2, 3, 40, 14],
    [0, 3, 100, 4],
  ];

  it('находит кратчайший по времени путь с направлениями', () => {
    const f = new PathFinder();
    f.setGraph(graph(nodes, edges));
    const r = f.find(req(0, 20, 2, 20));
    expect(r.ok).toBe(true);
    expect(r.steps).toEqual([1, 2, 3]);
  });

  it('стартовый шаг идёт в сторону ближайшего выгодного узла (направление −1)', () => {
    const f = new PathFinder();
    f.setGraph(graph(nodes, edges));
    // старт на e1 у узла 1, финиш на e0 у узла 0 → сначала назад по e1? нет: e1 → узел 1 → e0 против направления
    const r = f.find(req(1, 5, 0, 5));
    expect(r.ok).toBe(true);
    expect(r.steps[0]).toBe(-2);
    expect(r.steps[r.steps.length - 1]).toBe(-1);
  });

  it('тот же отрезок: один шаг в нужную сторону', () => {
    const f = new PathFinder();
    f.setGraph(graph(nodes, edges));
    expect(f.find(req(1, 5, 1, 30)).steps).toEqual([2]);
    expect(f.find(req(1, 30, 1, 5)).steps).toEqual([-2]);
  });

  it('предпочитает быструю дорогу, а при пробках выбирает объезд', () => {
    const f = new PathFinder();
    // два пути между узлами 1 и 2: быстрый e1 (40, скорость 20) и медленный e4 (60, скорость 14)
    const n: [number, number][] = [[0, 0], [40, 0], [80, 0], [120, 0]];
    const e: [number, number, number, number][] = [
      [0, 1, 40, 14],
      [1, 2, 40, 20],
      [2, 3, 40, 14],
      [1, 2, 60, 14],
    ];
    f.setGraph(graph(n, e));
    expect(f.find(req(0, 20, 2, 20)).steps).toContain(2);
    const occ = new Float32Array(4);
    occ[1] = 40;
    f.setOccupancy(occ);
    const jam = f.find(req(0, 20, 2, 20));
    expect(jam.steps).toContain(4);
    expect(jam.steps).not.toContain(2);
  });

  it('возвращает отказ: другая версия графа, разные компоненты, неверные индексы', () => {
    const f = new PathFinder();
    f.setGraph(graph([[0, 0], [10, 0], [50, 50], [60, 50]], [[0, 1, 10, 14], [2, 3, 10, 14]]));
    expect(f.find(req(0, 5, 1, 5)).ok).toBe(false);
    expect(f.find(req(0, 5, 1, 5, 2)).ok).toBe(false);
    expect(f.find(req(0, 5, 9, 5)).ok).toBe(false);
  });
});
