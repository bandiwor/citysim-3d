import { describe, expect, it } from 'vitest';
import { effectiveDef } from '../src/data/services';
import { hasKey, setLocale } from '../src/i18n';
import { lookOf } from '../src/sim/looks';
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
    expect(crime.robberies).toBeGreaterThanOrEqual(1);
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

describe('автовыравнивание рельефа', () => {
  function hillGame(autoLevel: boolean) {
    const g = createGame({ size: 80, config: { terraform: { autoLevel } } });
    g.builder.terraform('raise', 200, 200, 30);
    for (let i = 0; i < 6; i++) g.builder.terraform('raise', 200, 200, 30);
    return g;
  }

  it('дорога через холм строится со срезом рельефа за дополнительные деньги', () => {
    const g = hillGame(true);
    expect(g.world.terrainAt(200, 200)).toBe(Terrain.Blocked);
    const b = g.builder;
    const plan = b.planRoad(b.snap(100, 200), b.snap(300, 200), null, 'street');
    expect(plan.ok).toBe(true);
    expect(plan.levelCost).toBeGreaterThan(0);
    const before = g.get('economy').money;
    expect(b.buildRoad(plan).ok).toBe(true);
    expect(before - g.get('economy').money).toBeCloseTo(plan.cost);
    expect(g.world.terrainAt(200, 200)).not.toBe(Terrain.Blocked);
  });

  it('отключённое автовыравнивание оставляет отказ err.terrain', () => {
    const g = hillGame(false);
    const b = g.builder;
    expect(b.planRoad(b.snap(100, 200), b.snap(300, 200), null, 'street').reasonKey).toBe('err.terrain');
  });

  it('служба на холме ставится, рельеф под ней срезается', () => {
    const g = hillGame(true);
    const b = g.builder;
    road(g, 100, 100, 300, 100);
    const s = b.snapService('police', 200, 108);
    expect(b.canPlaceService('police', s.x, s.z, s.rot).ok).toBe(true);
    g.builder.terraform('raise', s.x, s.z, 14);
  });
});

describe('улучшения зданий', () => {
  it('улучшение электростанции увеличивает выработку и содержание, повторно не покупается', async () => {
    const g = await city();
    const coal = g.world.list().find((b) => b.defId === 'coal')!;
    const def = g.services.require('coal');
    const before = { power: coal.powerOut, upkeep: coal.upkeep };
    const money = g.get('economy').money;
    const r = g.builder.upgradeService(coal, 'turbines');
    expect(r.ok).toBe(true);
    expect(coal.powerOut).toBeCloseTo(before.power * 1.5);
    expect(coal.upkeep).toBeGreaterThan(before.upkeep);
    expect(g.get('economy').money).toBe(money - def.upgrades!.find((u) => u.id === 'turbines')!.cost);
    expect(g.builder.upgradeService(coal, 'turbines').reasonKey).toBe('err.upgrade.done');
    expect(g.builder.upgradeService(coal, 'nope').reasonKey).toBe('err.upgrade.none');
    expect(g.builder.serviceLevel(coal)).toEqual({ level: 2, max: 4 });
  });

  it('улучшения меняют радиус покрытия, ёмкость и парк машин; сохраняются', async () => {
    const g = await city();
    place(g, 'police', 110, 85);
    place(g, 'landfill', 140, 135);
    const police = g.world.list().find((b) => b.defId === 'police')!;
    const landfill = g.world.list().find((b) => b.defId === 'landfill')!;
    g.builder.upgradeService(police, 'cars');
    g.builder.upgradeService(police, 'station');
    g.builder.upgradeService(landfill, 'compaction');
    const fleetCap = g.get('fleet').free(police);
    expect(fleetCap).toBe(4);
    expect(effectiveDef(g.services.require('police'), police.up).coverage!.radius).toBeCloseTo(11 * 1.35);
    expect(effectiveDef(g.services.require('landfill'), landfill.up).waste!.capacity).toBe(4000 * 1.8);
    const data = g.get('save').serialize();
    expect(data.buildings.find((b) => b.id === police.id)!.up).toBe(police.up);
  });

  it('у каждой службы с улучшениями есть переводы, а у моделей — детали или запасной вариант', () => {
    const g = createGame();
    setLocale('en');
    for (const d of g.services.all()) for (const u of d.upgrades ?? []) {
      expect(hasKey(`upgrade.${d.id}.${u.id}.name`), `${d.id}.${u.id}`).toBe(true);
      expect(hasKey(`upgrade.${d.id}.${u.id}.desc`), `${d.id}.${u.id}`).toBe(true);
    }
  });
});

describe('люди', () => {
  it('внешность детерминирована и разнообразна', () => {
    expect(lookOf(42)).toEqual(lookOf(42));
    const kinds = new Set<number>();
    const shirts = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const l = lookOf(i * 977);
      kinds.add(l.kind);
      shirts.add(l.shirt);
      expect(l.height).toBeGreaterThan(0.5);
    }
    expect(kinds.size).toBe(3);
    expect(shirts.size).toBeGreaterThan(6);
    // дети ниже взрослых, пожилые медленнее
    const kid = [...Array(300).keys()].map((i) => lookOf(i)).find((l) => l.kind === 1)!;
    const old = [...Array(300).keys()].map((i) => lookOf(i)).find((l) => l.kind === 2)!;
    expect(kid.height).toBeLessThan(0.8);
    expect(old.speed).toBeLessThan(1);
  });
});
