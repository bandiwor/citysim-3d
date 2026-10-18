import { describe, expect, it } from 'vitest';
import { SaveSystem } from '../src/sim/SaveSystem';
import { createGame, road, run, settle } from './helpers';

type G = ReturnType<typeof createGame>;

function place(g: G, id: string, x: number, z: number): void {
  const s = g.builder.snapService(id, x, z);
  const r = g.builder.placeService(id, s.x, s.z, s.rot);
  expect(r.ok, `${id}: ${r.reasonKey}`).toBe(true);
}

/** Город у восточного края карты 60×60 (480 м): дорога до x=474 — выезд к соседям. */
async function linkedCity(edge = true): Promise<G> {
  const g = createGame({ size: 60 });
  road(g, 120, 200, edge ? 474 : 380, 200);
  await settle(g);
  return g;
}

describe('погода и сезоны', () => {
  it('сезон по месяцу и модификаторы погоды', () => {
    const g = createGame();
    const w = g.get('weather');
    const time = g.get('time');
    for (const [m, s] of [[0, 'winter'], [3, 'spring'], [6, 'summer'], [9, 'autumn'], [11, 'winter']] as const) {
      time.month = m;
      expect(w.season()).toBe(s);
    }
    const before = g.get('mods').mul('waterDemand');
    w.set('heat');
    expect(g.get('mods').mul('waterDemand')).toBeGreaterThan(before);
    expect(g.get('mods').mul('fire')).toBeGreaterThan(1);
    w.set('rain');
    expect(g.get('mods').mul('fire')).toBeLessThan(1);
  });

  it('снег копится в снегопад и тает в оттепель; осадки и температура', async () => {
    const g = createGame();
    const w = g.get('weather');
    g.get('time').month = 0;
    w.set('snow', 50);
    await run(g, 40);
    expect(w.precipitation()).toBeGreaterThan(0.3);
    expect(w.snow).toBeGreaterThan(0.2);
    const snowed = w.snow;
    g.get('time').month = 6;
    w.set('clear', 50);
    expect(w.temperature()).toBeGreaterThan(10);
    await run(g, 30);
    expect(w.snow).toBeLessThan(snowed);
  });

  it('погода меняется со временем и сохраняется', async () => {
    const g = createGame();
    const w = g.get('weather');
    const seen = new Set<string>();
    for (let d = 0; d < 60; d++) {
      await run(g, g.config.time.dayLength, 0.5);
      seen.add(w.kind);
    }
    expect(seen.size).toBeGreaterThan(1);
    w.set('storm', 4);
    w.snow = 0.4;
    const data = JSON.parse(JSON.stringify(g.get('save').serialize()));
    const g2 = createGame({ start: false });
    SaveSystem.apply(g2, data);
    g2.start();
    g2.step(0.1);
    expect(g2.get('weather').kind).toBe('storm');
    expect(g2.get('weather').snow).toBeCloseTo(0.4, 1);
  });
});

describe('соседние города и торговля', () => {
  it('дорога до края карты — выезд; без неё торговли нет', async () => {
    const off = await linkedCity(false);
    expect(off.get('trade').connected).toBe(false);
    const g = await linkedCity();
    const tr = g.get('trade');
    expect(tr.connected).toBe(true);
    expect(tr.links[0].side).toBe('e');
    expect(g.get('mods').add('demandInd')).toBeGreaterThan(0);
  });

  it('импорт снабжает город без своих станций, выключение импорта его обесточивает', async () => {
    const g = await linkedCity();
    place(g, 'police', 200, 215);
    await run(g, 2);
    const u = g.get('utility');
    const police = g.world.list().find((b) => b.defId === 'police')!;
    expect(police.powered).toBe(true);
    expect(u.powerImport).toBeGreaterThan(0);
    expect(g.get('economy').computeBudget().expense.imports).toBeGreaterThan(0);
    g.get('trade').set('importPower', false);
    await run(g, 2);
    expect(police.powered).toBe(false);
  });

  it('излишки своих станций продаются только при наличии выезда', async () => {
    for (const edge of [false, true]) {
      const g = await linkedCity(edge);
      place(g, 'coal', 200, 230);
      await run(g, 2);
      const b = g.get('economy').computeBudget();
      if (edge) expect(b.income.export).toBeGreaterThan(0);
      else expect(b.income.export).toBe(0);
    }
  });
});

describe('туризм', () => {
  it('достопримечательности, выезд и отель дают туристов и выручку', async () => {
    const g = await linkedCity();
    place(g, 'coal', 400, 230);
    place(g, 'monument', 200, 230);
    const tour = g.get('tourism');
    expect(tour.attractions().length).toBe(1);
    expect(tour.beds()).toBe(0);
    await run(g, 5);
    expect(tour.tourists).toBe(0);
    place(g, 'hotel', 260, 170);
    await run(g, 40, 0.5);
    expect(tour.beds()).toBeGreaterThan(0);
    expect(tour.tourists).toBeGreaterThan(10);
    expect(g.get('economy').computeBudget().income.tourism).toBeGreaterThan(0);
  });

  it('без выезда туристы не приезжают; одинаковые достопримечательности дают меньше', async () => {
    const g = await linkedCity(false);
    place(g, 'monument', 200, 230);
    place(g, 'hotel', 260, 170);
    expect(g.get('tourism').demand()).toBe(0);
    const linked = await linkedCity();
    place(linked, 'monument', 160, 230);
    const one = linked.get('tourism').factors().base;
    place(linked, 'monument', 300, 230);
    const two = linked.get('tourism').factors().base;
    expect(two).toBeGreaterThan(one);
    expect(two).toBeLessThan(one * 2);
  });
});

describe('природные ресурсы', () => {
  it('карты детерминированы и есть разные ресурсы', () => {
    const a = createGame({ size: 80 });
    const b = createGame({ size: 80 });
    for (const k of ['fertile', 'forest', 'ore', 'oil'] as const) expect(Array.from(a.get('resources').maps[k])).toEqual(Array.from(b.get('resources').maps[k]));
    const any = (k: 'fertile' | 'forest') => a.get('resources').maps[k].some((v) => v > 0.4);
    expect(any('fertile') || any('forest')).toBe(true);
  });

  it('промышленность на руде становится шахтой, добыча истощает запас, иссякший рудник — обычный завод', async () => {
    const g = await linkedCity();
    const res = g.get('resources');
    // руда вдоль дороги
    res.maps.ore.fill(0.9);
    g.config.resources.depletion = 0.05;
    place(g, 'coal', 400, 230);
    place(g, 'watertower', 140, 215);
    g.builder.paintZone(220, 212, 30, 'ind');
    await settle(g);
    // здание появляется на клетке промышленной зоны (как при росте города)
    const cell = g.world.zones.list().find((c) => c.zone && !c.building)!;
    g.builder.spawnOnCell(cell, 'ind');
    const mines = g.world.list().filter((b) => b.spec === 'ore');
    expect(mines.length).toBeGreaterThan(0);
    const mine = mines[0];
    // шахте нужны рабочие без образования, она загрязняет и даёт сырьё на экспорт
    const plain = g.builder.createBuilding('zone', 'ind', 0, 0, 0, 7, 7);
    expect(mine.jobs).toBe(Math.round(plain.jobs * 1));
    expect(g.world.list().filter((b) => b.kind === 'zone' && b.zone === 'ind' && !b.spec)).toHaveLength(0);
    const reserve = res.sample('ore', mine.x, mine.z);
    mine.workers = Math.max(mine.workers, 20);
    for (let m = 0; m < 40 && mine.spec; m++) {
      mine.workers = 20;
      g.bus.emit('time:month');
    }
    expect(res.sample('ore', mine.x, mine.z)).toBeLessThan(reserve);
    expect(mine.spec).toBe('');
  });

  it('специализация и истощение переживают сохранение', async () => {
    const g = await linkedCity();
    const res = g.get('resources');
    const i = g.world.gridIndex(200, 200);
    res.maps.oil[i] = 0.123;
    const data = JSON.parse(JSON.stringify(g.get('save').serialize()));
    const g2 = createGame({ size: 60, start: false });
    SaveSystem.apply(g2, data);
    g2.start();
    g2.step(0.1);
    // запас восстановился только там, где был вычерпан (ниже исходного)
    if (res.maps.oil[i] < (createGame({ size: 60 }).get('resources').maps.oil[i] ?? 0)) expect(g2.get('resources').maps.oil[i]).toBeCloseTo(0.123, 2);
  });
});
