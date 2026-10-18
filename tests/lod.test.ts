import type { BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { SERVICES } from '../src/data/services';
import { withLod } from '../src/render/GeomBuilder';
import { carModel, serviceModel } from '../src/render/models';
import { propModel } from '../src/render/propModels';
import '../src/render/serviceExtras';
import '../src/render/modelsV2';
import { zoneModel } from '../src/render/zoneModels';

const tris = (g: BufferGeometry): number => g.getAttribute('position').count / 3;

describe('детализация моделей (LOD)', () => {
  it('у каждого здания ближняя модель подробнее, а дальняя — заметно легче', () => {
    let near = 0;
    let far = 0;
    for (const zone of ['res', 'com', 'ind'])
      for (let lv = 1; lv <= 4; lv++)
        for (let v = 0; v < 6; v++) {
          near += tris(withLod(0, () => zoneModel(zone, lv, v, 2)));
          far += tris(withLod(1, () => zoneModel(zone, lv, v, 2)));
        }
    for (const d of SERVICES) {
      const ups = (d.upgrades ?? []).map((u) => u.id);
      const a = tris(withLod(0, () => serviceModel(d.model, d.size[0], d.size[1], ups)));
      const b = tris(withLod(1, () => serviceModel(d.model, d.size[0], d.size[1], ups)));
      expect(b).toBeLessThanOrEqual(a);
      near += a;
      far += b;
    }
    expect(far).toBeLessThan(near * 0.6);
  });

  it('улучшения добавляют видимые детали вблизи', () => {
    const d = SERVICES.find((s) => (s.upgrades?.length ?? 0) >= 3)!;
    const base = tris(withLod(0, () => serviceModel(d.model, d.size[0], d.size[1])));
    const one = tris(withLod(0, () => serviceModel(d.model, d.size[0], d.size[1], [d.upgrades![0].id])));
    const all = tris(withLod(0, () => serviceModel(d.model, d.size[0], d.size[1], d.upgrades!.map((u) => u.id))));
    expect(one).toBeGreaterThan(base);
    expect(all).toBeGreaterThan(one);
  });

  it('машины и растения упрощаются вдали', () => {
    expect(tris(withLod(1, carModel))).toBeLessThan(tris(withLod(0, carModel)));
    for (const k of ['oak', 'pine', 'birch', 'bush', 'flowers']) expect(tris(propModel(k, 1))).toBeLessThan(tris(propModel(k, 0)) * 0.8);
  });
});
