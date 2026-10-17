import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { SaveSystem } from '../src/sim/SaveSystem';
import type { Building } from '../src/core/types';
import { coreFeature, disastersFeature, roadsFeature, servicesFeature, trafficFeature, zonesFeature } from '../src/features';
import { flatTerrain } from '../src/world/Terrain';
import { createGame, road, run, settle } from './helpers';

/** Маленький город: дорога, станции, зоны. */
async function town(opts: { power?: boolean; water?: boolean; zones?: boolean } = {}) {
  const g = createGame();
  road(g, 40, 100, 200, 100);
  const place = (id: string, x: number, z: number) => {
    const s = g.builder.snapService(id, x, z);
    const r = g.builder.placeService(id, s.x, s.z, s.rot);
    expect(r.ok, `${id}: ${r.reasonKey}`).toBe(true);
  };
  if (opts.power !== false) place('coal', 190, 130);
  if (opts.water !== false) place('watertower', 60, 112);
  if (opts.zones !== false) {
    g.builder.paintZone(90, 112, 40, 'res');
    g.builder.paintZone(150, 112, 14, 'com');
    g.builder.paintZone(150, 88, 14, 'ind');
  }
  await settle(g);
  return g;
}

describe('TimeSystem', () => {
  it('идут дни, месяцы и годы с событиями', () => {
    const g = createGame();
    const t = g.get('time');
    let days = 0;
    let months = 0;
    let years = 0;
    g.bus.on('time:day', () => days++);
    g.bus.on('time:month', () => months++);
    g.bus.on('time:year', () => years++);
    const dayLen = g.config.time.dayLength;
    const start = t.year;
    for (let i = 0; i < (dayLen * 30 * 12 * 10) / 0.1; i++) g.step(0.1);
    expect(days).toBeGreaterThanOrEqual(30 * 12 * 10 - 1);
    expect(months).toBeGreaterThanOrEqual(12 * 10 - 1);
    expect(years).toBeGreaterThanOrEqual(9);
    expect(t.year).toBeGreaterThanOrEqual(start + 9);
  });

  it('на паузе время суток и календарь стоят, скорость умножает ход', () => {
    const g = createGame();
    const t = g.get('time');
    g.setSpeed(0);
    const tod = t.tod;
    for (let i = 0; i < 100; i++) g.step(0.1);
    expect(t.tod).toBe(tod);
    g.setSpeed(4);
    g.step(0.1);
    expect(t.tod).toBeGreaterThan(tod);
  });
});

describe('NetworkSystem', () => {
  it('считает компоненты связности и подключает здания', async () => {
    const g = createGame();
    road(g, 40, 100, 120, 100);
    road(g, 40, 300, 120, 300);
    await settle(g);
    const net = g.get('network');
    expect(net.compCount).toBe(2);
    const a = [...g.world.graph.edges.values()].find((e) => e.pts[0].z === 100)!;
    const b = [...g.world.graph.edges.values()].find((e) => e.pts[0].z === 300)!;
    expect(net.compOfEdge(a.id)).not.toBe(net.compOfEdge(b.id));
    road(g, 80, 100, 80, 300);
    await settle(g);
    expect(net.compCount).toBe(1);
    expect(net.compOfEdge(a.id)).toBe(net.compOfEdge(b.id));
  });

  it('назначает зданиям ребро доступа и компоненту, а клетки без дороги пропадают', async () => {
    const g = await town();
    const s = g.builder.snapService('police', 100, 112);
    g.builder.placeService('police', s.x, s.z, s.rot);
    await settle(g);
    const police = g.world.list().find((b) => b.defId === 'police')!;
    expect(police.access).toBeGreaterThan(0);
    expect(police.comp).toBeGreaterThanOrEqual(0);
    g.builder.bulldozeRect(0, 60, 400, 140);
    await settle(g);
    expect(g.world.zones.list()).toHaveLength(0);
  });

  it('асинхронно ищет путь между зданиями и отказывает между разными сетями', async () => {
    const g = createGame();
    road(g, 40, 100, 160, 100);
    road(g, 40, 300, 160, 300);
    await settle(g);
    const net = g.get('network');
    const edges = [...g.world.graph.edges.values()];
    const e1 = edges.find((e) => e.pts[0].z === 100)!;
    const e2 = edges.find((e) => e.pts[0].z === 300)!;
    const last = edges.filter((e) => e.pts[0].z === 100).pop()!;
    const steps = await net.requestPath(e1.id, 5, last.id, 5);
    expect(steps).not.toBeNull();
    expect(steps![0].edge).toBe(e1.id);
    expect(steps![steps!.length - 1].edge).toBe(last.id);
    expect(await net.requestPath(e1.id, 5, e2.id, 5)).toBeNull();
  });
});

describe('UtilitySystem', () => {
  it('питает здания той же сети и не питает отрезанные', async () => {
    const g = await town();
    const cells = g.world.zones.list().filter((c) => c.zone);
    const b = g.builder.spawnOnCell(cells[0], 'res');
    await settle(g);
    expect(b.powered).toBe(true);
    expect(b.watered).toBe(true);
    road(g, 40, 300, 160, 300);
    g.builder.paintZone(100, 312, 10, 'res');
    const far = g.builder.spawnOnCell(g.world.zones.near(100, 312, 10)[0], 'res');
    await settle(g);
    expect(far.powered).toBe(false);
    expect(g.get('utility').hasSpare(far.comp, 1, 1)).toBe(false);
  });

  it('при дефиците энергии достаётся старым зданиям', async () => {
    const g = await town({ power: false, zones: false });
    // ветрогенератор (70) даёт энергию только на пару зданий
    const s = g.builder.snapService('wind', 120, 112);
    g.builder.placeService('wind', s.x, s.z, s.rot);
    g.builder.paintZone(90, 112, 50, 'res');
    const cells = g.world.zones.list().filter((c) => c.zone).slice(0, 40);
    expect(cells.length).toBeGreaterThan(30);
    const bs: Building[] = cells.map((c) => g.builder.spawnOnCell(c, 'res'));
    await settle(g);
    const powered = bs.filter((b) => b.powered).length;
    expect(powered).toBeGreaterThan(0);
    expect(powered).toBeLessThan(bs.length);
    const firstUnpowered = bs.findIndex((b) => !b.powered);
    expect(bs.slice(firstUnpowered).every((b) => !b.powered)).toBe(true);
    const u = g.get('utility');
    expect(u.powerSupply).toBe(70);
    expect(u.powerDemand).toBeGreaterThan(70);
  });

  it('вода: башне нужна электроэнергия', async () => {
    const g = await town({ power: false });
    const tower = g.world.list().find((b) => b.defId === 'watertower')!;
    expect(tower.powered).toBe(false);
    expect(g.get('utility').waterSupply).toBe(0);
  });
});

describe('EconomySystem', () => {
  it('списывает деньги, не уходит ниже нуля и считает кредит', () => {
    const g = createGame({ money: 100 });
    const eco = g.get('economy');
    expect(eco.spend(60)).toBe(true);
    expect(eco.spend(60)).toBe(false);
    expect(eco.money).toBe(40);
    eco.takeLoan();
    expect(eco.debt).toBe(g.config.economy.loanStep);
    expect(eco.money).toBe(40 + g.config.economy.loanStep);
    expect(eco.computeBudget().expense.interest).toBeCloseTo(g.config.economy.loanStep * g.config.economy.loanInterest);
    eco.repayLoan();
    expect(eco.debt).toBe(0);
    for (let i = 0; i < g.config.economy.maxLoans + 2; i++) eco.takeLoan();
    expect(eco.debt).toBe(g.config.economy.loanStep * g.config.economy.maxLoans);
  });

  it('ограничивает налоги и финансирование', () => {
    const g = createGame();
    const eco = g.get('economy');
    eco.setTax('res', 999);
    eco.setFunding('police', -3);
    expect(eco.taxes.res).toBe(g.config.economy.maxTax);
    expect(eco.funding.police).toBe(0);
  });

  it('бюджет: налоги с жителей и работников, содержание дорог и служб', async () => {
    const g = await town();
    const cells = g.world.zones.list();
    const res = g.builder.spawnOnCell(cells.find((c) => c.zone === g.zoneTypes.require('res').index + 1)!, 'res');
    const com = g.builder.spawnOnCell(cells.find((c) => c.zone === g.zoneTypes.require('com').index + 1)!, 'com');
    await settle(g);
    res.pop = res.cap;
    com.workers = com.jobs;
    const eco = g.get('economy');
    const b = eco.computeBudget();
    expect(b.income.res).toBeGreaterThan(0);
    expect(b.income.com).toBeGreaterThan(0);
    expect(b.expense.roads).toBeGreaterThan(0);
    expect(b.expense.services).toBeGreaterThan(0);
    expect(b.net).toBeCloseTo(b.incomeTotal - b.expenseTotal);
    eco.setTax('res', 0);
    expect(eco.computeBudget().income.res).toBe(0);
    eco.setFunding('utilities', 0);
    expect(eco.computeBudget().expense.services).toBe(0);
  });

  it('в конце месяца применяет баланс и пишет историю не длиннее лимита', async () => {
    const g = await town();
    const eco = g.get('economy');
    const m0 = eco.money;
    g.bus.emit('time:month');
    expect(eco.last).not.toBeNull();
    expect(eco.money).toBeCloseTo(m0 + eco.last!.net);
    for (let i = 0; i < g.config.economy.historyLength + 10; i++) g.bus.emit('time:month');
    expect(eco.history.net).toHaveLength(g.config.economy.historyLength);
  });
});

describe('Stats / Demand', () => {
  it('считает население, рабочие места и безработицу', async () => {
    const g = await town();
    const cells = g.world.zones.list();
    const r = g.builder.spawnOnCell(cells.find((c) => c.zone === 1)!, 'res');
    const k = g.builder.spawnOnCell(cells.find((c) => c.zone === 2)!, 'com');
    await settle(g);
    r.pop = 8;
    const st = g.get('stats');
    st.recompute();
    const expected = g.world.list().filter((b) => b.zone === 'res').reduce((s, b) => s + b.pop, 0);
    expect(st.population).toBe(Math.round(expected));
    expect(st.population).toBeGreaterThanOrEqual(8);
    const liveCom = g.world.list().filter((b) => b.zone === 'com' && b.powered && b.watered && b.access > 0 && !b.abandoned).reduce((n, b) => n + b.jobs, 0);
    expect(st.jobsCom).toBe(liveCom);
    expect(st.jobsCom).toBeGreaterThanOrEqual(k.jobs);
    expect(st.jobsTotal).toBeGreaterThan(0);
    expect(st.unemployment).toBe(0);
    expect(st.workforce).toBeCloseTo(st.population * g.config.stats.workforceRatio, 0);
  });

  it('спрос: старт положителен; безработица гасит жилой, налоги давят на всё', () => {
    const g = createGame();
    const d = g.get('demand');
    const st = g.get('stats');
    for (let i = 0; i < 30; i++) d.refresh();
    expect(d.values.res).toBeGreaterThan(0.1);
    expect(d.values.ind).toBeGreaterThan(0.1);
    // много жителей, нет работы
    Object.assign(st, { population: 2000, workforce: 1000, jobsTotal: 50, jobsCom: 20, jobsInd: 30, happiness: 0.5 });
    for (let i = 0; i < 30; i++) d.refresh();
    expect(d.values.res).toBeLessThan(0);
    expect(d.values.com).toBeGreaterThan(0);
    const calm = d.values.com;
    g.get('economy').setTax('com', 25);
    for (let i = 0; i < 30; i++) d.refresh();
    expect(d.values.com).toBeLessThan(calm);
    for (const v of Object.values(d.values)) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });
});

describe('GrowthSystem', () => {
  it('застраивает размеченные клетки при спросе, электричестве и воде', async () => {
    const g = await town();
    await run(g, 40);
    const zoned = g.world.list().filter((b) => b.kind === 'zone');
    expect(zoned.length).toBeGreaterThan(3);
    expect(zoned.some((b) => b.zone === 'res')).toBe(true);
    for (const b of zoned) {
      const c = g.world.zones.cells.get(b.cell)!;
      expect(c.building).toBe(b.id);
      expect(Math.hypot(b.x - c.x, b.z - c.z)).toBe(0);
      expect(b.rot).toBe(c.rot);
    }
  });

  it('без электричества и воды здания не растут', async () => {
    const g = await town({ power: false, water: false });
    await run(g, 30);
    expect(g.world.list().filter((b) => b.kind === 'zone')).toHaveLength(0);
  });

  it('жители заселяются постепенно, а потеря коммуналки ведёт к заброшенности и сносу', async () => {
    const g = await town();
    await run(g, 25);
    const house = g.world.list().find((b) => b.kind === 'zone' && b.zone === 'res')!;
    expect(house).toBeDefined();
    await run(g, 25);
    expect(house.pop).toBeGreaterThan(0);
    // отрезаем электричество
    for (const b of g.world.list()) if (b.powerOut > 0) g.builder.removeBuilding(b);
    await run(g, g.config.growth.abandonAfterOutage + 5);
    expect(house.abandoned).toBe(true);
    expect(house.pop).toBe(0);
    await run(g, g.config.growth.removeAfterAbandon + 5);
    expect(g.world.buildings.has(house.id)).toBe(false);
    const cell = g.world.zones.cells.get(house.cell)!;
    expect(cell.building).toBe(0);
    expect(cell.zone).toBeGreaterThan(0);
  });

  it('счастье растёт от служб и падает от загрязнения и отключения коммуналки', async () => {
    const g = await town();
    await run(g, 20);
    const house = g.world.list().find((b) => b.kind === 'zone' && b.zone === 'res')!;
    const growth = g.get('growth');
    const maps = g.get('maps');
    const st = g.get('stats');
    // фиксируем входы формулы, чтобы шаги проверялись детерминированно
    house.powered = true;
    house.watered = true;
    st.unemployment = 0;
    const idx = g.world.gridIndex(house.x, house.z);
    for (const t of ['police', 'park', 'fire', 'health', 'education']) maps.coverage(t)[idx] = 0;
    maps.pollution[idx] = 0;
    maps.noise[idx] = 0;
    const base = growth.happinessOf(house);
    maps.coverage('police')[idx] = 1;
    maps.coverage('park')[idx] = 1;
    const better = growth.happinessOf(house);
    expect(better).toBeGreaterThan(base);
    maps.pollution[idx] = 1;
    const polluted = growth.happinessOf(house);
    expect(polluted).toBeLessThan(better);
    house.powered = false;
    expect(growth.happinessOf(house)).toBeLessThan(polluted - 0.2);
    expect(growth.happinessOf(house)).toBeGreaterThanOrEqual(0);
  });

  it('смена уровня пересчитывает вместимость и потребности', async () => {
    const g = await town();
    await run(g, 20);
    const house = g.world.list().find((b) => b.kind === 'zone' && b.zone === 'res')!;
    const cap1 = house.cap;
    g.builder.setLevel(house, 2);
    expect(house.cap).toBeGreaterThan(cap1);
    expect(house.powerNeed).toBeGreaterThan(0);
    g.builder.setLevel(house, 1);
    expect(house.cap).toBe(cap1);
  });
});

describe('MapsSystem', () => {
  it('источники: покрытие работающих служб; результат приходит из вычислителя', async () => {
    const g = await town();
    const s = g.builder.snapService('police', 100, 112);
    g.builder.placeService('police', s.x, s.z, s.rot);
    await settle(g);
    const maps = g.get('maps');
    const sources = maps.collectSources();
    expect(sources.some((x) => x.layer === 'pollution')).toBe(true);
    const police = g.world.list().find((b) => b.defId === 'police')!;
    police.powered = false;
    expect(maps.collectSources().some((x) => x.layer === 'police')).toBe(false);
    police.powered = true;
    expect(maps.collectSources().some((x) => x.layer === 'police')).toBe(true);
    await maps.recompute();
    expect(maps.sample('police', police.x, police.z)).toBeGreaterThan(0.5);
    expect(maps.sample('police', 5, 5)).toBe(0);
    expect(maps.sample('pollution', 190, 130)).toBeGreaterThan(0.3);
    expect(maps.sample('landValue', police.x, police.z)).toBeGreaterThan(0);
  });

  it('финансирование масштабирует силу покрытия', async () => {
    const g = await town();
    const s = g.builder.snapService('police', 100, 112);
    g.builder.placeService('police', s.x, s.z, s.rot);
    await settle(g);
    const maps = g.get('maps');
    g.get('economy').setFunding('police', 0.5);
    const half = maps.collectSources().find((x) => x.layer === 'police')!.strength;
    g.get('economy').setFunding('police', 1);
    const full = maps.collectSources().find((x) => x.layer === 'police')!.strength;
    expect(half).toBeLessThan(full);
  });
});

describe('TrafficSystem', () => {
  it('машина едет по пути, меняет занятость рёбер и исчезает по прибытии', async () => {
    const g = createGame();
    road(g, 40, 100, 200, 100);
    await settle(g);
    const net = g.get('network');
    const traffic = g.get('traffic');
    const edges = [...g.world.graph.edges.values()];
    const first = edges[0];
    const last = edges[edges.length - 1];
    const steps = await net.requestPath(first.id, 2, last.id, last.len - 2);
    expect(steps).not.toBeNull();
    let arrived = 0;
    const v = traffic.spawn(steps, 2, last.len - 2, 'car')!;
    v.onArrive = () => {
      arrived++;
      return false;
    };
    expect(traffic.occupancy.get(first.id)).toBe(1);
    const x0 = v.x;
    await run(g, 2);
    expect(Math.abs(v.x - x0)).toBeGreaterThan(5);
    expect(traffic.occupancy.size).toBeLessThanOrEqual(1);
    await run(g, 20);
    expect(arrived).toBe(1);
    expect(traffic.vehicles).toHaveLength(0);
    expect(traffic.occupancy.size).toBe(0);
  });

  it('едет по правой полосе и в нужную сторону', async () => {
    const g = createGame();
    road(g, 40, 100, 200, 100);
    await settle(g);
    const edges = [...g.world.graph.edges.values()];
    const net = g.get('network');
    const eastbound = (await net.requestPath(edges[0].id, 2, edges[edges.length - 1].id, 10))!;
    const v = g.get('traffic').spawn(eastbound, 2, 10, 'car')!;
    // движение на восток (+x): правая сторона — юг (+z)
    expect(v.z).toBeGreaterThan(100);
    const west = (await net.requestPath(edges[edges.length - 1].id, 30, edges[0].id, 10))!;
    const w = g.get('traffic').spawn(west, 30, 10, 'car')!;
    expect(w.z).toBeLessThan(100);
  });

  it('убирает машины, если ребро пути удалено или изменено', async () => {
    const g = createGame();
    road(g, 40, 100, 200, 100);
    await settle(g);
    const net = g.get('network');
    const traffic = g.get('traffic');
    const edges = [...g.world.graph.edges.values()];
    const steps = (await net.requestPath(edges[0].id, 2, edges[edges.length - 1].id, 10))!;
    traffic.spawn(steps, 2, 10, 'car');
    expect(traffic.vehicles).toHaveLength(1);
    road(g, 120, 40, 120, 160);
    g.step(0.1);
    expect(traffic.vehicles.length).toBeLessThanOrEqual(1);
    g.builder.bulldozeRect(0, 0, 400, 400);
    g.step(0.1);
    await settle(g);
    expect(traffic.vehicles).toHaveLength(0);
    expect(traffic.occupancy.size).toBe(0);
  });

  it('пробки: загруженность замедляет поток', async () => {
    const g = createGame();
    road(g, 40, 100, 120, 100);
    await settle(g);
    const edges = [...g.world.graph.edges.values()];
    const net = g.get('network');
    const traffic = g.get('traffic');
    const e = edges[0];
    const steps = (await net.requestPath(e.id, 1, e.id, e.len - 1))!;
    const vs = Array.from({ length: 30 }, () => traffic.spawn(steps, 1, e.len - 1, 'car')!);
    expect(traffic.load(e.id)).toBeGreaterThan(1);
    const x = vs[0].s;
    await run(g, 0.5);
    const crawl = vs[0].s - x;
    const solo = traffic.spawn(steps, 1, e.len - 1, 'car')!;
    for (const v of vs) traffic.kill(v);
    const y = solo.s;
    await run(g, 0.5);
    expect(solo.s - y).toBeGreaterThan(crawl);
    expect(traffic.flow).toBeLessThanOrEqual(1);
  });

  it('город генерирует поездки: жители ездят на работу и возвращаются', async () => {
    const g = await town();
    await run(g, 30);
    const st = g.get('stats');
    expect(st.population).toBeGreaterThan(15);
    let seen = 0;
    for (let i = 0; i < 40; i++) {
      await run(g, 1);
      seen = Math.max(seen, g.get('traffic').vehicles.length);
    }
    expect(seen).toBeGreaterThan(0);
    expect(seen).toBeLessThanOrEqual(g.config.traffic.maxVehicles + g.config.traffic.busExtra);
  });

  it('уважает лимит машин', async () => {
    const g = createGame({ config: { traffic: { maxVehicles: 2 } } });
    road(g, 40, 100, 120, 100);
    await settle(g);
    const e = [...g.world.graph.edges.values()][0];
    const steps = (await g.get('network').requestPath(e.id, 1, e.id, e.len - 1))!;
    const t = g.get('traffic');
    expect(t.spawn(steps, 1, 10, 'car')).not.toBeNull();
    expect(t.spawn(steps, 1, 10, 'car')).not.toBeNull();
    expect(t.spawn(steps, 1, 10, 'car')).toBeNull();
  });
});

describe('TransitSystem', () => {
  it('две остановки в одной сети порождают автобусы, дающие долю поездок и расход', async () => {
    const g = await town();
    await run(g, 30);
    expect(g.builder.placeStop(60, 100).ok).toBe(true);
    expect(g.get('transit').buses).toHaveLength(0);
    expect(g.builder.placeStop(170, 100).ok).toBe(true);
    await run(g, 3);
    const tr = g.get('transit');
    expect(tr.stops).toHaveLength(2);
    expect(tr.buses.length).toBeGreaterThan(0);
    expect(tr.upkeep()).toBe(2 * g.config.economy.stopUpkeep + tr.buses.length * g.config.economy.busUpkeep);
    expect(tr.share(60, 100)).toBeGreaterThan(0);
    expect(tr.share(60, 500)).toBe(0);
    const before = g.get('economy').computeBudget().income.transit;
    tr.rider(10);
    expect(g.get('economy').computeBudget().income.transit).toBeCloseTo(before + 10 * g.config.economy.fare);
  });

  it('автобус ездит между остановками и не умирает на остановке', async () => {
    const g = createGame();
    road(g, 40, 100, 200, 100);
    g.builder.placeStop(60, 100);
    g.builder.placeStop(180, 100);
    await settle(g);
    await run(g, 60);
    const tr = g.get('transit');
    expect(tr.buses.length).toBeGreaterThan(0);
    expect(tr.buses.every((b) => !b.dead)).toBe(true);
  });

  it('одна остановка — автобусов нет, удаление дороги убирает остановки', async () => {
    const g = createGame();
    road(g, 40, 100, 200, 100);
    g.builder.placeStop(60, 100);
    await settle(g);
    await run(g, 2);
    expect(g.get('transit').buses).toHaveLength(0);
    g.builder.bulldozeRect(0, 0, 400, 400);
    await settle(g);
    expect(g.world.stops).toHaveLength(0);
  });
});

describe('DisasterSystem', () => {
  it('без пожарной части здание сгорает, при покрытии огонь тушится', async () => {
    const g = await town();
    await run(g, 25);
    const d = g.get('disaster');
    const victims = g.world.list().filter((b) => b.kind === 'zone');
    expect(victims.length).toBeGreaterThan(1);
    // без пожарной части и без шанса потушить здание сгорает
    const cfg = g.config.disasters;
    const base = cfg.extinguishBase;
    cfg.extinguishBase = 0;
    const burning = victims[0];
    d.ignite(burning);
    expect(burning.fire).toBeGreaterThan(0);
    await run(g, cfg.burnTime + 3);
    expect(g.world.buildings.has(burning.id)).toBe(false);
    cfg.extinguishBase = base;
    // с пожарной частью поблизости огонь тушится
    let s = { x: 0, z: 0, rot: 0, snapped: false };
    for (let x = 60; x <= 190; x += 6) {
      for (const z of [130, 70]) {
        const c = g.builder.snapService('fire', x, z);
        if (g.builder.canPlaceService('fire', c.x, c.z, c.rot).ok) s = c;
        if (s.snapped) break;
      }
      if (s.snapped) break;
    }
    expect(s.snapped).toBe(true);
    expect(g.builder.placeService('fire', s.x, s.z, s.rot).ok).toBe(true);
    await settle(g);
    await g.get('maps').recompute();
    const saved = g.world.list().filter((b) => b.kind === 'zone' && Math.hypot(b.x - s.x, b.z - s.z) < 60)[0];
    expect(saved).toBeDefined();
    d.ignite(saved);
    await run(g, 12);
    expect(saved.fire).toBe(0);
  });

  it('сгоревшее здание освобождает клетку', async () => {
    const g = await town();
    await run(g, 20);
    const b = g.world.list().find((x) => x.kind === 'zone')!;
    b.fire = g.config.disasters.burnTime + 1;
    g.get('maps').coverage('fire').fill(0);
    const cfg = g.config.disasters;
    cfg.extinguishBase = 0;
    cfg.extinguishCoverage = 0;
    await run(g, 2);
    expect(g.world.buildings.has(b.id)).toBe(false);
    expect(g.world.zones.cells.get(b.cell)!.building).not.toBe(b.id);
  });

  it('отключаемость: при enabled=false ежемесячных пожаров нет', async () => {
    const g = await town();
    await run(g, 20);
    g.get('disaster').enabled = false;
    for (let i = 0; i < 200; i++) g.bus.emit('time:month');
    expect(g.world.list().some((b) => b.fire > 0)).toBe(false);
  });
});

describe('SaveSystem', () => {
  it('сериализация и восстановление сохраняют дороги, клетки, здания, деньги и время', async () => {
    const g = await town();
    road(g, 100, 60, 100, 100);
    g.builder.placeStop(60, 100);
    await run(g, 30);
    const data = JSON.parse(JSON.stringify(g.get('save').serialize()));

    const g2 = new Game({ seed: data.seed, terrain: flatTerrain(60), config: { disasters: { enabled: false } } });
    g2.use(roadsFeature).use(zonesFeature).use(servicesFeature).use(trafficFeature).use(coreFeature).use(disastersFeature);
    SaveSystem.apply(g2, data);
    g2.start();
    await settle(g2);

    expect(g2.world.graph.edges.size).toBe(g.world.graph.edges.size);
    expect(g2.world.graph.nodes.size).toBe(g.world.graph.nodes.size);
    expect(g2.world.zones.list().length).toBe(g.world.zones.list().length);
    expect(g2.world.zones.list().filter((c) => c.zone).length).toBe(g.world.zones.list().filter((c) => c.zone).length);
    expect(g2.world.list().length).toBe(g.world.list().length);
    expect(g2.world.stops).toHaveLength(1);
    expect(g2.world.stops[0].edge).toBeGreaterThan(0);
    expect(g2.get('economy').money).toBeCloseTo(g.get('economy').money);
    expect(g2.get('time').year).toBe(g.get('time').year);
    const b1 = g.world.list().find((b) => b.kind === 'zone')!;
    const b2 = g2.world.buildings.get(b1.id)!;
    expect(b2.x).toBeCloseTo(b1.x, 0);
    expect(b2.level).toBe(b1.level);
    expect(g2.world.zones.cells.get(b2.cell)!.building).toBe(b2.id);
    expect(b2.access).toBeGreaterThan(0);
    // игра продолжает работать
    await run(g2, 10);
    expect(g2.world.list().length).toBeGreaterThan(0);
  });
});
