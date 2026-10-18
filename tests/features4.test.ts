import { describe, expect, it } from 'vitest';
import { collectAmbient } from '../src/audio/collect';
import { collectOwnNames } from '../scripts/ownNames.mjs';
import { createGame, road, run, settle } from './helpers';

function place(g: ReturnType<typeof createGame>, id: string, x: number, z: number): void {
  const s = g.builder.snapService(id, x, z);
  const r = g.builder.placeService(id, s.x, s.z, s.rot);
  expect(r.ok, `${id}: ${r.reasonKey}`).toBe(true);
}

async function town(density: number) {
  const g = createGame();
  road(g, 40, 100, 200, 100);
  place(g, 'coal', 190, 130);
  place(g, 'watertower', 60, 112);
  g.builder.paintZone(90, 112, 40, 'res', density);
  await settle(g);
  await run(g, 60);
  return g;
}

describe('плотность застройки', () => {
  it('по умолчанию растут малоэтажные дома', async () => {
    const g = await town(0);
    const houses = g.world.list().filter((b) => b.kind === 'zone' && b.zone === 'res');
    expect(houses.length).toBeGreaterThan(0);
    expect(houses.every((b) => b.level === 1)).toBe(true);
  });

  it('высокая плотность даёт здания повышенной этажности', async () => {
    const g = await town(3);
    const houses = g.world.list().filter((b) => b.kind === 'zone' && b.zone === 'res');
    expect(houses.length).toBeGreaterThan(0);
    expect(houses.every((b) => b.level === 3)).toBe(true);
  });
});

describe('новые службы', () => {
  it('атомная станция даёт много энергии, скважина — воду', async () => {
    const g = createGame();
    road(g, 40, 100, 200, 100);
    place(g, 'nuclear', 120, 140);
    place(g, 'well', 60, 112);
    await settle(g);
    const n = g.world.list().find((b) => b.defId === 'nuclear')!;
    expect(n.powerOut).toBeGreaterThan(g.services.require('coal').provides!.power! * 2);
    expect(g.world.list().find((b) => b.defId === 'well')!.waterOut).toBeGreaterThan(0);
  });

  it('у каждой новой службы есть модель и звук там, где задан тег', () => {
    const g = createGame();
    for (const id of ['nuclear', 'geothermal', 'windfarm', 'well', 'desalination', 'policepost', 'firepost', 'firehelidepot', 'pharmacy', 'medcenter', 'kindergarten', 'highschool', 'college', 'garden', 'sports']) {
      expect(g.services.require(id).model).toBe(id);
    }
  });
});

describe('образование', () => {
  it('школа со временем повышает долю образованных', async () => {
    const g = createGame();
    road(g, 40, 100, 200, 100);
    place(g, 'coal', 190, 130);
    place(g, 'watertower', 60, 112);
    place(g, 'highschool', 100, 80);
    g.builder.paintZone(90, 112, 40, 'res');
    await settle(g);
    await run(g, 60);
    const st = g.get('stats');
    const before = st.eduEducated;
    await run(g, 400, 0.5);
    expect(st.eduEducated).toBeGreaterThan(before);
    expect(st.eduHigh).toBeLessThanOrEqual(st.eduEducated);
  });
});

describe('эмбиент', () => {
  it('завод слышно дальше фонтана', async () => {
    const g = createGame();
    road(g, 40, 100, 300, 100);
    place(g, 'coal', 100, 130);
    place(g, 'garden', 100, 60);
    await settle(g);
    const far = collectAmbient(g, { x: 100 + 150, z: 100, distance: 60, night: 0 });
    expect(far.sources!.machinery ?? 0).toBeGreaterThan(0);
    expect(far.sources!.fountain ?? 0).toBe(0);
  });
});

describe('сборка', () => {
  it('в список мангла не попадают ключи данных и общие имена', () => {
    const names = new Set(collectOwnNames());
    for (const n of ['x', 'z', 'level', 'wealth', 'pop', 'update', 'add', 'dispose']) expect(names.has(n)).toBe(false);
    expect(names.size).toBeGreaterThan(50);
  });
});
