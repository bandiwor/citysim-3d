import { describe, expect, it } from 'vitest';
import { bezier2, cumulative, obbContains, obbDist, obbOverlap, pointAtLength, pointSeg, polyDistToObb, polyLength, projectOnPolyline, resample, segIntersect } from '../src/world/geometry';

const P = (x: number, z: number) => ({ x, z });

describe('geometry', () => {
  it('находит пересечение отрезков', () => {
    const h = segIntersect(P(0, 0), P(10, 10), P(0, 10), P(10, 0))!;
    expect(h.x).toBeCloseTo(5);
    expect(h.z).toBeCloseTo(5);
    expect(h.t).toBeCloseTo(0.5);
    expect(h.u).toBeCloseTo(0.5);
  });

  it('не пересекает параллельные и непересекающиеся отрезки', () => {
    expect(segIntersect(P(0, 0), P(10, 0), P(0, 1), P(10, 1))).toBeNull();
    expect(segIntersect(P(0, 0), P(1, 1), P(5, 0), P(5, 10))).toBeNull();
  });

  it('считает ближайшую точку отрезка', () => {
    const r = pointSeg(P(5, 3), P(0, 0), P(10, 0));
    expect(r.d).toBeCloseTo(3);
    expect(r.t).toBeCloseTo(0.5);
    expect(pointSeg(P(-4, 0), P(0, 0), P(10, 0)).d).toBeCloseTo(4);
  });

  it('точка на ломаной по длине и проекция', () => {
    const pts = [P(0, 0), P(10, 0), P(10, 10)];
    const cum = cumulative(pts);
    expect(polyLength(pts)).toBeCloseTo(20);
    const p = pointAtLength(pts, cum, 15);
    expect(p.x).toBeCloseTo(10);
    expect(p.z).toBeCloseTo(5);
    expect(p.tz).toBeCloseTo(1);
    const pr = projectOnPolyline(pts, cum, P(12, 4));
    expect(pr.s).toBeCloseTo(14);
    expect(pr.d).toBeCloseTo(2);
  });

  it('передискретизация сохраняет концы и шаг', () => {
    const out = resample([P(0, 0), P(40, 0)], 4);
    expect(out).toHaveLength(11);
    expect(out[0]).toEqual(P(0, 0));
    expect(out[10]).toEqual(P(40, 0));
  });

  it('кривая Безье начинается и заканчивается в заданных точках и изгибается к опорной', () => {
    const pts = bezier2(P(0, 0), P(20, 40), P(40, 0), 4);
    expect(pts[0]).toEqual(P(0, 0));
    expect(pts[pts.length - 1]).toEqual(P(40, 0));
    const top = Math.max(...pts.map((p) => p.z));
    expect(top).toBeGreaterThan(15);
    expect(top).toBeLessThan(21);
  });

  it('прямоугольник: расстояние, вхождение, пересечение с поворотом', () => {
    const o = { x: 0, z: 0, hw: 4, hd: 2, rot: 0 };
    expect(obbContains(o, P(3, 1))).toBe(true);
    expect(obbDist(o, P(7, 0))).toBeCloseTo(3);
    const rotated = { x: 0, z: 0, hw: 4, hd: 2, rot: Math.PI / 2 };
    expect(obbDist(rotated, P(0, 6))).toBeCloseTo(2);
    expect(obbOverlap(o, { x: 7, z: 0, hw: 4, hd: 2, rot: 0 })).toBe(true);
    expect(obbOverlap(o, { x: 9, z: 0, hw: 4, hd: 2, rot: 0 })).toBe(false);
    expect(obbOverlap(o, { x: 9, z: 0, hw: 4, hd: 2, rot: 0 }, 2)).toBe(true);
    expect(polyDistToObb([P(-10, 6), P(10, 6)], o)).toBeCloseTo(4);
  });
});
