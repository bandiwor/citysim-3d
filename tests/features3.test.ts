import { describe, expect, it } from 'vitest';
import { clockLabel, phaseIcon } from '../src/ui/format';
import { lightGroups, lightState } from '../src/sim/lights';
import { Terrain } from '../src/world/Terrain';
import { createGame, road, run, settle } from './helpers';

function place(g: ReturnType<typeof createGame>, id: string, x: number, z: number): void {
  const s = g.builder.snapService(id, x, z);
  const r = g.builder.placeService(id, s.x, s.z, s.rot);
  expect(r.ok, `${id}: ${r.reasonKey}`).toBe(true);
}

async function city() {
  const g = createGame({ size: 80 });
  road(g, 40, 100, 220, 100);
  place(g, 'coal', 200, 130);
  place(g, 'watertower', 60, 112);
  g.builder.paintZone(90, 112, 40, 'res');
  await settle(g);
  return g;
}

describe('типы дорог', () => {
  it('зарегистрированы переулок, односторонняя, просёлочная, бульвар', () => {
    const g = createGame();
    for (const id of ['alley', 'street', 'oneway', 'country', 'avenue', 'boulevard', 'highway']) expect(g.roadTypes.has(id), id).toBe(true);
    expect(g.roadTypes.require('oneway').oneway).toBe(true);
    expect(g.roadTypes.require('boulevard').width).toBeGreaterThan(g.roadTypes.require('avenue').width);
  });

  it('односторонняя дорога запрещает путь против движения', async () => {
    const g = createGame();
    expect(road(g, 40, 100, 200, 100, 'oneway')).toBe(true);
    await settle(g);
    const e = [...g.world.graph.edges.values()][0];
    const net = g.get('network');
    const fwd = await net.requestPath(e.id, 5, e.id, e.len - 5);
    const back = await net.requestPath(e.id, e.len - 5, e.id, 5);
    expect(fwd).not.toBeNull();
    expect(back).toBeNull();
  });
});

describe('светофоры', () => {
  it('ставятся только на перекрёстках и убираются', async () => {
    const g = createGame();
    road(g, 40, 100, 200, 100);
    road(g, 120, 40, 120, 180);
    await settle(g);
    expect(g.builder.setTrafficLight(60, 100, true).ok).toBe(false);
    const before = g.get('economy').money;
    expect(g.builder.setTrafficLight(120, 100, true).ok).toBe(true);
    expect(g.get('economy').money).toBeLessThan(before);
    expect(g.builder.junctionNear(120, 100)?.light).toBe(true);
    expect(g.builder.setTrafficLight(120, 100, true).ok).toBe(false);
    expect(g.builder.setTrafficLight(120, 100, false).ok).toBe(true);
    expect(g.builder.junctionNear(120, 100)?.light).toBe(false);
  });

  it('фазы чередуются: одна группа зелёная, другая красная', async () => {
    const g = createGame();
    road(g, 40, 100, 200, 100);
    road(g, 120, 40, 120, 180);
    await settle(g);
    const node = g.builder.junctionNear(120, 100)!;
    const groups = lightGroups(g.world.graph, node);
    expect(new Set(groups.values()).size).toBe(2);
    const c = g.config.roads;
    expect(lightState(0, 1, c)).toBe('green');
    expect(lightState(1, 1, c)).toBe('red');
    expect(lightState(0, c.lightCycle / 2 + 1, c)).toBe('red');
    expect(lightState(1, c.lightCycle / 2 + 1, c)).toBe('green');
    expect(lightState(0, c.lightCycle / 2 - 0.5, c)).toBe('yellow');
  });
});

describe('рельеф', () => {
  it('поднимает, опускает и выравнивает землю; рядом с дорогой защищён', async () => {
    const g = createGame({ size: 80 });
    road(g, 40, 100, 120, 100);
    await settle(g);
    const w = g.world;
    expect(g.builder.terraform('raise', 300, 300, 20).ok).toBe(true);
    expect(w.heightAt(300, 300)).toBeGreaterThan(0.1);
    const h = w.heightAt(300, 300);
    expect(g.builder.terraform('flatten', 300, 300, 20).ok).toBe(true);
    expect(w.heightAt(300, 300)).toBeLessThan(h);
    // у дороги ничего не меняется
    expect(g.builder.terraform('raise', 80, 100, 8).ok).toBe(false);
    expect(w.heightAt(80, 100)).toBe(0);
  });

  it('глубокая яма превращается в воду, правки попадают в сохранение', () => {
    const g = createGame({ size: 80 });
    for (let i = 0; i < 12; i++) g.builder.terraform('lower', 300, 300, 24);
    expect(g.world.terrainAt(300, 300)).toBe(Terrain.Water);
    expect(g.get('save').serialize().terrain!.length).toBeGreaterThan(0);
  });
});

describe('мусор и смерть', () => {
  it('здания копят мусор, мусоровоз везёт его на свалку', async () => {
    const g = await city();
    place(g, 'landfill', 140, 135);
    await settle(g);
    await run(g, 20);
    const homes = g.world.list().filter((b) => b.kind === 'zone');
    expect(homes.length).toBeGreaterThan(0);
    for (const b of homes) b.garbage = g.config.garbage.dispatchAt + 5;
    await run(g, 90);
    const s = g.get('sanitation');
    const landfill = g.world.list().find((b) => b.defId === 'landfill')!;
    expect(landfill.stored).toBeGreaterThan(0);
    expect(s.garbageTotal).toBeLessThan(homes.length * (g.config.garbage.dispatchAt + 5));
  });

  it('мусоросжигатель сжигает отходы', async () => {
    const g = await city();
    place(g, 'incinerator', 160, 135);
    await settle(g);
    const inc = g.world.list().find((b) => b.defId === 'incinerator')!;
    inc.stored = 100;
    await run(g, 10);
    expect(inc.stored).toBeLessThan(100);
  });

  it('умершие вывозятся катафалком на кладбище', async () => {
    const g = await city();
    place(g, 'cemetery', 150, 135);
    await settle(g);
    await run(g, 5);
    const home = g.world.list().find((b) => b.kind === 'zone' && b.access > 0)!;
    home.pop = Math.max(home.pop, 4);
    home.dead = 2;
    await run(g, 90);
    const cem = g.world.list().find((b) => b.defId === 'cemetery')!;
    expect(cem.stored).toBeGreaterThan(0);
  });
});

describe('ограбления', () => {
  it('ограбление начинается, отмечает здание и заканчивается', async () => {
    const g = await city();
    place(g, 'police', 110, 85);
    await settle(g);
    await run(g, 20);
    const b = g.world.list().find((x) => x.kind === 'zone' && x.access > 0)!;
    const crime = g.get('crime');
    expect(crime.start(b)).toBe(true);
    expect(b.incident).toBeGreaterThan(0);
    expect(crime.active).toContain(b);
    expect(crime.start(b)).toBe(false);
    await run(g, g.config.crime.timeout + 40);
    expect(b.incident).toBe(0);
    expect(crime.robberies).toBe(1);
  });
});

describe('время суток', () => {
  it('часы соответствуют освещению: tod 0.5 — полдень, 0.25 — рассвет', () => {
    expect(clockLabel(0.5)).toBe('12:00');
    expect(clockLabel(0.25)).toBe('06:00');
    expect(clockLabel(0.75)).toBe('18:00');
    expect(clockLabel(0)).toBe('00:00');
    expect(phaseIcon(0.5)).toBe('☀️');
    expect(phaseIcon(0.0)).toBe('🌙');
    expect(phaseIcon(0.27)).toBe('🌅');
    expect(phaseIcon(0.78)).toBe('🌇');
  });
});

describe('пешеходы', () => {
  it('появляются рядом с фокусом и ходят по тротуарам, вне фокуса — нет', async () => {
    const g = await city();
    await run(g, 20);
    for (const b of g.world.list()) if (b.kind === 'zone') b.pop = Math.max(b.pop, 20);
    const ped = g.get('pedestrians');
    g.get('time').tod = 0.5;
    ped.focus = null;
    await run(g, 3);
    expect(ped.walkers).toHaveLength(0);
    ped.focus = { x: 110, z: 100 };
    await run(g, 12);
    expect(ped.walkers.length).toBeGreaterThan(0);
    const w = ped.walkers[0];
    const x0 = w.x;
    const z0 = w.z;
    await run(g, 5);
    expect(Math.hypot(w.x - x0, w.z - z0)).toBeGreaterThan(0.5);
    ped.focus = { x: 5000, z: 5000 };
    await run(g, 2);
    expect(ped.walkers).toHaveLength(0);
  });
});
