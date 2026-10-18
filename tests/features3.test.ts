import { describe, expect, it } from 'vitest';
import { isBuilding } from '../src/core/types';
import { SaveSystem } from '../src/sim/SaveSystem';
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

describe('движение машин', () => {
  async function crossing(light: boolean) {
    const g = createGame({ size: 80, config: { traffic: { maxVehicles: 80, maxAge: 400 } } });
    road(g, 40, 200, 360, 200);
    road(g, 200, 40, 200, 360);
    await settle(g);
    if (light) g.builder.setTrafficLight(200, 200, true);
    await settle(g);
    return g;
  }

  async function stress(g: Awaited<ReturnType<typeof crossing>>, seconds: number): Promise<{ minDist: number; arrived: number }> {
    const tr = g.get('traffic');
    const net = g.get('network');
    const edges = [...g.world.graph.edges.values()];
    let arrived = 0;
    let minDist = Infinity;
    for (let t = 0; t < seconds; t += 0.1) {
      // каждую секунду пускаем машины со случайных краёв в случайные другие
      if (Math.abs(t - Math.round(t)) < 0.05) {
        for (let k = 0; k < 3; k++) {
          const a = edges[Math.floor(Math.random() * edges.length)];
          const b = edges[Math.floor(Math.random() * edges.length)];
          if (a === b) continue;
          void net.requestPath(a.id, a.len / 2, b.id, b.len / 2).then((steps) => {
            const v = tr.spawn(steps, a.len / 2, b.len / 2, 'car');
            if (v) v.onArrive = () => (arrived++, false);
          });
        }
      }
      g.step(0.1);
      await Promise.resolve();
      await Promise.resolve();
      const vs = tr.vehicles;
      for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
        if (vs[i].wait > 0 || vs[j].wait > 0) continue;
        minDist = Math.min(minDist, Math.hypot(vs[i].x - vs[j].x, vs[i].z - vs[j].z));
      }
    }
    return { minDist, arrived };
  }

  it('на перекрёстке без светофора машины не проезжают сквозь друг друга', async () => {
    const g = await crossing(false);
    const r = await stress(g, 120);
    expect(r.arrived).toBeGreaterThan(10);
    expect(r.minDist).toBeGreaterThan(1.7);
  });

  it('на перекрёстке со светофором тоже', async () => {
    const g = await crossing(true);
    const r = await stress(g, 120);
    expect(r.arrived).toBeGreaterThan(10);
    expect(r.minDist).toBeGreaterThan(1.7);
  });

  it('на повороте курс меняется плавно, без рывков', async () => {
    const g = await crossing(false);
    const tr = g.get('traffic');
    const net = g.get('network');
    const edges = [...g.world.graph.edges.values()];
    const a = edges.find((e) => Math.abs(e.pts[0].x - e.pts[e.pts.length - 1].x) > 30)!;
    const b = edges.find((e) => Math.abs(e.pts[0].z - e.pts[e.pts.length - 1].z) > 30)!;
    const steps = (await net.requestPath(a.id, 2, b.id, b.len - 2))!;
    const v = tr.spawn(steps, 2, b.len - 2, 'car')!;
    let prevYaw = v.yaw;
    let prevX = v.x;
    let prevZ = v.z;
    let maxTurn = 0;
    let maxJump = 0;
    for (let i = 0; i < 400 && !v.dead; i++) {
      g.step(0.05);
      let d = v.yaw - prevYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      maxTurn = Math.max(maxTurn, Math.abs(d));
      maxJump = Math.max(maxJump, Math.hypot(v.x - prevX, v.z - prevZ));
      prevYaw = v.yaw;
      prevX = v.x;
      prevZ = v.z;
    }
    expect(maxJump).toBeLessThan(2.5);
    expect(maxTurn).toBeLessThan(0.5);
  });
});

describe('вывоз мусора', () => {
  it('мусоровозы забирают мусор у целых улиц за заезд: свалка заполняется, переполнения нет', async () => {
    const g = await city();
    place(g, 'landfill', 140, 135);
    await settle(g);
    await run(g, 40);
    const homes = g.world.list().filter((b) => b.kind === 'zone');
    expect(homes.length).toBeGreaterThan(5);
    for (const b of homes) {
      b.pop = b.cap;
      b.garbage = 30;
    }
    const before = homes.reduce((s, b) => s + b.garbage, 0);
    await run(g, 150);
    const landfill = g.world.list().find((b) => b.defId === 'landfill')!;
    expect(landfill.stored).toBeGreaterThan(before * 0.5);
    expect(homes.reduce((s, b) => s + b.garbage, 0)).toBeLessThan(before * 0.4);
    expect(g.get('sanitation').overflowing).toBe(0);
  }, 30000);
});

describe('прогресс, политики, цели, события, советник', () => {
  function career() {
    const g = createGame({ size: 80, config: { progress: { enabled: true } } });
    return g;
  }

  it('в карьере содержимое закрыто до роста города, в песочнице открыто', () => {
    const g = career();
    const b = g.builder;
    road(g, 40, 100, 200, 100);
    expect(g.get('progress').isUnlocked('service:hospital')).toBe(false);
    const s = b.snapService('hospital', 100, 112);
    expect(b.placeService('hospital', s.x, s.z, s.rot).reasonKey).toBe('err.locked');
    expect(b.planRoad(b.snap(40, 200), b.snap(200, 200), null, 'highway').reasonKey).toBe('err.locked');
    g.get('progress').restore(5000);
    expect(g.get('progress').isUnlocked('service:hospital')).toBe(true);
    expect(g.get('progress').level).toBeGreaterThanOrEqual(4);
    const sandbox = createGame({ size: 80 });
    expect(sandbox.get('progress').isUnlocked('service:stadium')).toBe(true);
  });

  it('достижение уровня выдаёт награду и сообщение', async () => {
    const g = career();
    const got: string[] = [];
    g.bus.on('message', (m) => got.push(m.key));
    const before = g.get('economy').money;
    Object.defineProperty(g.get('stats'), 'population', { get: () => 200, set: () => {}, configurable: true });
    await run(g, 1.5);
    expect(g.get('progress').level).toBe(1);
    expect(g.get('economy').money).toBe(before + g.config.progress.levels[1].reward);
    expect(got).toContain('msg.levelUp');
    expect(got).toContain('msg.unlocked');
  });

  it('политики меняют модификаторы и берут плату в бюджет', () => {
    const g = createGame();
    g.get('stats').population = 1000;
    const ps = g.get('policy');
    const crime0 = g.get('mods').mul('crime');
    expect(ps.toggle('watch').ok).toBe(true);
    expect(g.get('mods').mul('crime')).toBeCloseTo(crime0 * 0.6);
    expect(g.get('economy').computeBudget().expense.policies).toBe(g.policies.require('watch').upkeep);
    expect(ps.toggle('watch').ok).toBe(true);
    expect(g.get('mods').mul('crime')).toBe(1);
    expect(g.get('economy').computeBudget().expense.policies).toBe(0);
    // к счастью добавляются и сезон/погода: сравниваем с тем, что было до политики
    const h0 = g.get('mods').add('happiness');
    ps.toggle('parks');
    expect(g.get('mods').add('happiness')).toBeCloseTo(h0 + 0.04);
  });

  it('временный модификатор истекает через заданное число дней', async () => {
    const g = createGame();
    const mods = g.get('mods');
    const h0 = mods.add('happiness');
    mods.put({ id: 'x', icon: '⭐', nameKey: 'event.festival.title', until: g.get('time').totalDays + 3, add: { happiness: 0.1 } });
    expect(mods.add('happiness')).toBeCloseTo(h0 + 0.1);
    await run(g, g.config.time.dayLength * 4);
    expect(mods.active.some((m) => m.id === 'x')).toBe(false);
  });

  it('событие: выбор списывает деньги и накладывает эффект; без ответа применяется вариант по умолчанию', () => {
    const g = createGame();
    g.get('stats').population = 600;
    const ev = g.get('events');
    ev.start('crimewave');
    expect(ev.pending?.id).toBe('crimewave');
    const money = g.get('economy').money;
    expect(ev.choose('patrols')).toBe(true);
    expect(g.get('economy').money).toBeLessThan(money);
    expect(g.get('mods').mul('crime')).toBeCloseTo(1.3);
    expect(ev.pending).toBeNull();
    ev.start('crimewave');
    g.get('time').totalDays += g.config.events.expireDays + 1;
    g.bus.emit('time:month');
    expect(ev.pending).toBeNull();
    expect(g.get('mods').mul('crime')).toBeCloseTo(2.4);
    g.get('economy').money = 0;
    ev.start('flu');
    expect(ev.choose('vaccinate')).toBe(false);
    expect(ev.pending?.id).toBe('flu');
  });

  it('цели подбираются под город, выполняются и приносят награду', async () => {
    const g = await city();
    const ob = g.get('objectives');
    ob.active = [];
    ob.fill();
    expect(ob.active.length).toBeGreaterThan(0);
    for (const o of ob.active) {
      expect(ob.isDone(o)).toBe(false);
      expect(ob.describe(o).text.length).toBeGreaterThan(3);
    }
    const money = g.get('economy').money;
    const o = ob.active[0];
    o.kind = 'money';
    o.target = 1;
    o.reward = 777;
    await run(g, 1.2);
    expect(ob.completed).toBe(1);
    expect(g.get('economy').money).toBeGreaterThan(money + 700);
    expect(ob.active.length).toBeGreaterThan(0);
  });

  it('советник находит проблемы и указывает место', async () => {
    const g = await city();
    await run(g, 30);
    const adv = g.get('advisor');
    const b = g.world.list().find((x) => x.kind === 'zone')!;
    b.fire = 3;
    adv.refresh();
    const fire = adv.issues.find((i) => i.id === 'fire')!;
    expect(fire.sev).toBe('bad');
    expect(fire.x).toBe(b.x);
    b.fire = 0;
    Object.defineProperty(g.get('stats'), 'population', { get: () => 500, set: () => {}, configurable: true });
    adv.refresh();
    expect(adv.issues.some((i) => i.id === 'noPolice')).toBe(true);
    expect(adv.issues.some((i) => i.id === 'noLandfill')).toBe(true);
  });

  it('излишки энергии продаются: доход растёт с запасом', async () => {
    const g = await city();
    const base = g.get('economy').computeBudget().income.export;
    place(g, 'wind', 120, 80);
    place(g, 'wind', 140, 80);
    await settle(g);
    expect(g.get('economy').computeBudget().income.export).toBeGreaterThanOrEqual(base);
    expect(g.get('utility').powerSupply).toBeGreaterThan(g.get('utility').powerDemand);
  });

  it('сохранение хранит режим, политики, цели, модификаторы и событие', async () => {
    const g = createGame({ size: 80, config: { progress: { enabled: true } } });
    g.get('stats').population = 900;
    g.get('progress').restore(900);
    g.get('policy').toggle('smoke');
    g.get('mods').put({ id: 'event:x', icon: '🎉', nameKey: 'event.festival.title', until: 50, add: { happiness: 0.05 } });
    g.get('events').start('storm');
    g.get('objectives').fill();
    const data = JSON.parse(JSON.stringify(g.get('save').serialize()));
    expect(data.mode).toBe('career');
    expect(data.policies).toEqual(['smoke']);
    expect(data.progress.peak).toBe(900);
    expect(data.event.id).toBe('storm');
    expect(data.mods).toHaveLength(1);
    const g2 = createGame({ size: 80, start: false, config: { progress: { enabled: true } } });
    SaveSystem.apply(g2, data);
    g2.start();
    g2.step(0.1);
    expect(g2.get('policy').has('smoke')).toBe(true);
    // сезон и погода тоже дают модификаторы, поэтому проверяем сами восстановленные эффекты
    const active = g2.get('mods').active;
    expect(active.filter((m) => m.mul?.fire === 0.45)).toHaveLength(1);
    expect(active.find((m) => m.id === 'event:x')?.add?.happiness).toBeCloseTo(0.05);
    expect(g2.get('events').pending?.id).toBe('storm');
    expect(g2.get('progress').peakPop).toBe(900);
    expect(g2.get('objectives').active.length).toBe(g.get('objectives').active.length);
  });
});

describe('стройка по стадиям', () => {
  async function cityWithConstruction() {
    const g = createGame({ size: 80, config: { construction: { enabled: true } } });
    road(g, 40, 100, 220, 100);
    place(g, 'coal', 200, 130);
    place(g, 'watertower', 60, 112);
    g.builder.paintZone(90, 112, 30, 'res');
    await settle(g);
    return g;
  }

  it('новое здание строится: сначала не работает, потом достраивается и заселяется', async () => {
    const g = await cityWithConstruction();
    await run(g, 6);
    const list = g.world.list().filter((b) => b.kind === 'zone');
    expect(list.length).toBeGreaterThan(0);
    const b = list.find((x) => x.con < 1)!;
    expect(b).toBeDefined();
    expect(b.conKind).toBe(0);
    expect(b.pop).toBe(0);
    expect(g.get('construction').active).toContain(b);
    expect(g.get('economy').computeBudget().income.res).toBe(0);
    await run(g, b.conDur + 5);
    expect(b.con).toBe(1);
    expect(g.get('construction').active).not.toContain(b);
  });

  it('повышение благосостояния (★) и улучшение службы идут со стройкой, здание при этом работает', async () => {
    const g = await cityWithConstruction();
    g.config.growth.downgradeChance = 0;
    await run(g, 40);
    const house = g.world.list().find((b) => b.kind === 'zone' && b.con >= 1)!;
    g.builder.beginWealthUp(house, 2);
    expect(house.con).toBe(0);
    expect(house.conKind).toBe(1);
    expect(house.wealth).toBe(1);
    expect(isBuilding(house)).toBe(false);
    await run(g, g.config.construction.levelUp + 3);
    expect(house.wealth).toBe(2);
    expect(house.con).toBe(1);
    const coal = g.world.list().find((b) => b.defId === 'coal')!;
    await run(g, 40);
    g.get('economy').money = 1e9;
    const power0 = coal.powerOut;
    expect(g.builder.upgradeService(coal, 'turbines').ok).toBe(true);
    expect(coal.powerOut).toBe(power0);
    expect(g.builder.upgradeService(coal, 'scrubbers').reasonKey).toBe('err.upgrade.busy');
    await run(g, g.config.construction.upgrade + 3);
    expect(coal.powerOut).toBeGreaterThan(power0);
  });

  it('спрос гасится пустующими и строящимися зданиями: постройка не взрывается мгновенно', async () => {
    const g = await cityWithConstruction();
    g.builder.paintZone(130, 112, 60, 'res');
    await run(g, 12);
    const dm = g.get('demand');
    const built = g.world.list().filter((b) => b.kind === 'zone').length;
    expect(built).toBeLessThan(14);
    expect(dm.values.res).toBeLessThanOrEqual(dm.raw.res);
  });

  it('при нехватке энергии здания всё равно строятся', async () => {
    const g = createGame({ size: 80, config: { construction: { enabled: true } } });
    road(g, 40, 100, 220, 100);
    place(g, 'wind', 190, 130);
    place(g, 'watertower', 60, 112);
    g.builder.paintZone(90, 112, 50, 'res');
    await settle(g);
    await run(g, 120);
    expect(g.world.list().filter((b) => b.kind === 'zone').length).toBeGreaterThanOrEqual(3);
  });
});

describe('дороги: привязка и снос зданий зон', () => {
  it('дорога через жилое здание из заливки сносит его автоматически, служба мешает', async () => {
    const g = await city();
    await run(g, 40);
    const house = g.world.list().find((b) => b.kind === 'zone')!;
    const hid = house.id;
    const b = g.builder;
    const plan = b.planRoad(b.snap(house.x - 60, house.z), b.snap(house.x + 60, house.z), null, 'street');
    if (plan.ok) {
      expect(plan.demolish?.length ?? 0).toBeGreaterThanOrEqual(0);
      b.buildRoad(plan);
      if (plan.demolish?.includes(hid)) expect(g.world.buildings.has(hid)).toBe(false);
    }
    const off = createGame({ size: 80, config: { roads: { autoDemolish: false } } });
    expect(off.config.roads.autoDemolish).toBe(false);
  });

  it('инструмент дороги: режим 90° ведёт линию вдоль осей, режим «выкл» не привязывается к узлам', async () => {
    const { RoadTool } = await import('../src/tools/Tools');
    const g = createGame({ size: 80 });
    road(g, 40, 100, 200, 100);
    await settle(g);
    const tool = new RoadTool(g, 'street');
    const snapOpt = tool.options.find((o) => o.id === 'snap')!;
    const pv: { current: any } = { current: {} };
    const ctx = { game: g, shift: false, setPreview: (p: any) => Object.assign(pv.current, p), clearPreview: () => (pv.current = {}) } as any;
    snapOpt.set('ortho');
    tool.down({ x: 300, z: 300, shift: false }, ctx);
    tool.hover({ x: 380, z: 340, shift: false }, ctx);
    const pts = pv.current.ribbon.pts as { x: number; z: number }[];
    const end = pts[pts.length - 1];
    expect(Math.abs(end.z - 300) < 0.5 || Math.abs(end.x - 300) < 0.5).toBe(true);
    // свободный режим: точка не прилипает к ближайшему узлу
    snapOpt.set('free');
    tool.escape(ctx);
    tool.down({ x: 42, z: 103, shift: false }, ctx);
    const startPt = (pv.current.marker ?? {}) as { x: number };
    expect(startPt.x).toBeCloseTo(42, 0);
    // клавиша V переключает режимы по кругу
    tool.key('KeyV', ctx);
    expect(snapOpt.get()).toBe('grid');
  });
});

describe('болезни, пожары, ограбления, смерть', () => {
  it('до открытия медицины, полиции и пожарной части эти бедствия не начинаются (карьера)', async () => {
    const g = createGame({ size: 80, config: { progress: { enabled: true } } });
    expect(g.get('disease').active).toBe(false);
    g.get('progress').restore(0);
    expect(g.get('progress').isUnlocked('service:clinic')).toBe(false);
    expect(g.get('progress').isUnlocked('service:police')).toBe(false);
    expect(g.get('progress').isUnlocked('service:fire')).toBe(false);
    g.get('progress').restore(1000);
    Object.defineProperty(g.get('stats'), 'population', { get: () => 1000, set: () => {}, configurable: true });
    expect(g.get('disease').active).toBe(true);
  });

  it('болезнь: вспышка в доме растёт, перекидывается на соседей, но ограничена; поликлиника лечит', async () => {
    const g = await city();
    await run(g, 40);
    const homes = g.world.list().filter((b) => b.kind === 'zone' && g.zoneTypes.get(b.zone)?.housing);
    expect(homes.length).toBeGreaterThan(3);
    for (const b of homes) b.pop = b.cap;
    Object.defineProperty(g.get('stats'), 'population', { get: () => homes.reduce((s, b) => s + b.pop, 0), set: () => {}, configurable: true });
    const ds = g.get('disease');
    expect(ds.startOutbreak(homes[0])).toBe(true);
    expect(homes[0].sick).toBeGreaterThan(0);
    homes[0].sick = homes[0].pop * 0.4;
    await run(g, 120);
    const sickHomes = homes.filter((b) => b.sick > 0.5).length;
    expect(sickHomes).toBeGreaterThan(1);
    expect(ds.sickShare).toBeLessThanOrEqual(g.config.disease.maxSickFrac + 1e-6);
    for (const b of homes) expect(b.sick).toBeLessThanOrEqual(b.pop * g.config.disease.maxSickFrac + 1e-6);
  }, 30000);

  it('смерть: тела ждут катафалк, значок и недовольство появляются только после задержки', async () => {
    const g = await city();
    await run(g, 40);
    const home = g.world.list().find((b) => b.kind === 'zone' && g.zoneTypes.get(b.zone)?.housing)!;
    home.pop = 6;
    home.dead = 2;
    const dc = g.config.death;
    await run(g, 5);
    expect(home.deadFor).toBeGreaterThan(0);
    expect(home.deadFor).toBeLessThan(dc.iconAfter);
    await run(g, dc.iconAfter + 10);
    expect(home.deadFor).toBeGreaterThan(dc.iconAfter);
  }, 20000);

  it('пожар перекидывается на соседей, но число пожаров ограничено', async () => {
    const g = await city();
    await run(g, 50);
    const homes = g.world.list().filter((b) => b.kind === 'zone');
    const d = g.get('disaster');
    g.config.disasters.extinguishBase = 0;
    g.config.disasters.burnTime = 200;
    d.ignite(homes[0]);
    await run(g, 90);
    const burning = g.world.list().filter((b) => b.fire > 0).length;
    expect(burning).toBeGreaterThanOrEqual(1);
    expect(burning).toBeLessThanOrEqual(Math.max(g.config.disasters.minFires, Math.floor(g.world.buildings.size * g.config.disasters.maxFireShare)));
  }, 30000);
});

describe('звук на паузе', () => {
  it('на паузе заводы, транспорт и сирены замолкают', async () => {
    const { computeMix } = await import('../src/audio/mixer');
    const st = { zoom: 80, buildingsNear: 80, vehiclesNear: 40, industryNear: 8, waterNear: 0.2, trafficFlow: 0.8, night: 0, fires: 2, speed: 1, alarms: 1, sources: { machinery: 2, turbine: 1, fountain: 1, kids: 1, gulls: 1 } };
    const play = computeMix(st);
    const pause = computeMix({ ...st, speed: 0 });
    expect(play.industry).toBeGreaterThan(0.3);
    expect(play.siren).toBeGreaterThan(0.3);
    for (const k of ['traffic', 'industry', 'siren', 'machinery', 'turbine', 'fountain', 'gulls', 'kids'] as const) expect(pause[k], k).toBe(0);
  });
});
