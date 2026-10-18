import { expect, it } from 'vitest';
import { GeomBuilder, withLod } from '../src/render/GeomBuilder';
import { SERVICES } from '../src/data/services';
import { serviceModel } from '../src/render/models';
import '../src/render/serviceExtras';
import '../src/render/modelsV2';
import { zoneModel } from '../src/render/zoneModels';
type B = { w: number; h: number; d: number; x: number; y: number; z: number; ry: number; color: number };
let captured: B[] = [];
const det = (GeomBuilder.prototype as unknown as { _details: () => void })._details;
(GeomBuilder.prototype as unknown as { _details: () => void })._details = function (this: { _boxes: B[] }) {
  det.call(this);
  captured.push(...this._boxes);
};
const overlap = (a0: number, a1: number, b0: number, b1: number): boolean => Math.min(a1, b1) - Math.max(a0, b0) > 0.05;
function audit(name: string): string[] {
  const bs = captured.filter((b) => Math.abs(b.ry) < 1e-6);
  const out: string[] = [];
  for (let i = 0; i < bs.length; i++)
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      if (a.color === b.color) continue;
      const ax = [a.x - a.w / 2, a.x + a.w / 2], bx = [b.x - b.w / 2, b.x + b.w / 2];
      const az = [a.z - a.d / 2, a.z + a.d / 2], bz = [b.z - b.d / 2, b.z + b.d / 2];
      const ay = [a.y, a.y + a.h], by = [b.y, b.y + b.h];
      const xy = overlap(ax[0], ax[1], bx[0], bx[1]) && overlap(az[0], az[1], bz[0], bz[1]);
      // мерцают грани одной ориентации в одной плоскости: верх-верх, низ-низ (над землёй), бок-бок
      const zy = overlap(ay[0], ay[1], by[0], by[1]);
      if (xy && Math.abs(ay[1] - by[1]) < 0.004) out.push(`${name}: top y=${ay[1].toFixed(2)} ${a.color.toString(16)}/${b.color.toString(16)} ${a.w}x${a.d}/${b.w}x${b.d}`);
      if (zy && overlap(az[0], az[1], bz[0], bz[1])) for (const k of [0, 1]) if (Math.abs(ax[k] - bx[k]) < 0.004) out.push(`${name}: side x=${ax[k].toFixed(2)} ${a.color.toString(16)}/${b.color.toString(16)}`);
      if (zy && overlap(ax[0], ax[1], bx[0], bx[1])) for (const k of [0, 1]) if (Math.abs(az[k] - bz[k]) < 0.004) out.push(`${name}: side z=${az[k].toFixed(2)} ${a.color.toString(16)}/${b.color.toString(16)}`);
    }
  return out;
}
// перехватываем список коробок модели (после автодеталей), чтобы проверить грани на совпадение
it('ни у одной модели здания нет совпадающих граней разного цвета (мерцание, z-fighting)', () => {
  const all: string[] = [];
  for (const d of SERVICES) {
    captured = [];
    withLod(0, () => serviceModel(d.model, d.size[0], d.size[1], (d.upgrades ?? []).map((u) => u.id)));
    all.push(...audit(d.id));
  }
  for (const z of ['res', 'com', 'ind']) for (let lv = 1; lv <= 4; lv++) for (let v = 0; v < 8; v++) for (const w of [1, 2, 3]) {
    captured = [];
    withLod(0, () => zoneModel(z, lv, v, w));
    all.push(...audit(`${z}${lv}.${v}.w${w}`));
  }
  expect([...new Set(all)].slice(0, 20)).toEqual([]);
});
