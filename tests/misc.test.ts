import { describe, expect, it } from 'vitest';
import { AMBIENT_LAYERS, computeMix, type AmbientState } from '../src/audio/mixer';
import { defaultConfig, mergeConfig } from '../src/config/gameConfig';
import { InlineCompute } from '../src/workers/InlineCompute';
import { computeMaps, computeShore } from '../src/workers/maps';
import { generateTerrain, flatTerrain, Terrain, terrainParams } from '../src/world/Terrain';
import { Noise } from '../src/world/Noise';
import { Rng } from '../src/core/Rng';
import { EventBus } from '../src/core/EventBus';
import { Registry } from '../src/core/Registry';

describe('config', () => {
  it('глубоко сливает переопределения и не мутирует значения по умолчанию', () => {
    const before = defaultConfig.economy.startMoney;
    const c = mergeConfig({ economy: { startMoney: 5 }, zoning: { brushSizes: [1, 2] } });
    expect(c.economy.startMoney).toBe(5);
    expect(c.economy.defaultTax).toBe(defaultConfig.economy.defaultTax);
    expect(c.zoning.brushSizes).toEqual([1, 2]);
    expect(defaultConfig.economy.startMoney).toBe(before);
    c.maps.landValue.weights.park = 99;
    expect(defaultConfig.maps.landValue.weights.park).not.toBe(99);
  });
});

describe('Rng / Noise / Registry / EventBus', () => {
  it('Rng детерминирован', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    expect([a.next(), a.next(), a.int(0, 10)]).toEqual([b.next(), b.next(), b.int(0, 10)]);
  });
  it('шум детерминирован и ограничен', () => {
    const n = new Noise(7);
    expect(n.fbm(1.5, 2.5)).toBe(new Noise(7).fbm(1.5, 2.5));
    for (let i = 0; i < 200; i++) expect(Math.abs(n.noise(i * 0.37, i * 0.11))).toBeLessThanOrEqual(1.5);
  });
  it('реестр присваивает индексы и запрещает дубли', () => {
    const r = new Registry<{ id: string; index: number }>();
    r.add({ id: 'a', index: 0 }).add({ id: 'b', index: 0 });
    expect(r.require('b').index).toBe(1);
    expect(r.at(0).id).toBe('a');
    expect(() => r.add({ id: 'a', index: 0 })).toThrow();
    expect(() => r.require('zzz')).toThrow();
  });
  it('шина событий доставляет и отписывает', () => {
    const bus = new EventBus<{ a: number; b: void }>();
    const got: number[] = [];
    const off = bus.on('a', (v) => got.push(v));
    bus.emit('a', 1);
    off();
    bus.emit('a', 2);
    expect(got).toEqual([1]);
    let n = 0;
    bus.on('b', () => n++);
    bus.emit('b');
    expect(n).toBe(1);
  });
});

describe('рельеф', () => {
  const cfg = defaultConfig;
  it('детерминирован по seed и имеет ровный центр', () => {
    const a = generateTerrain(terrainParams(cfg, 3));
    const b = generateTerrain(terrainParams(cfg, 3));
    expect(Array.from(a.heights.slice(0, 50))).toEqual(Array.from(b.heights.slice(0, 50)));
    const n = a.size;
    expect(a.terrain[(n / 2) * n + n / 2]).toBe(Terrain.Land);
    let land = 0;
    for (const t of a.terrain) if (t === Terrain.Land) land++;
    expect(land / a.terrain.length).toBeGreaterThan(0.25);
  });
  it('по краям горы, есть вода, плоская карта целиком земля', () => {
    const a = generateTerrain(terrainParams(cfg, 11));
    expect(a.terrain[0]).toBe(Terrain.Blocked);
    expect(a.terrain.some((t) => t === Terrain.Water)).toBe(true);
    expect(flatTerrain(10).terrain.every((t) => t === Terrain.Land)).toBe(true);
  });
});

describe('computeMaps', () => {
  const base = { size: 20, cell: 8, layers: ['police', 'pollution'], shore: new Float32Array(400), landValue: { base: 0.3, weights: { police: 0.2, pollution: -0.5 } } };
  it('покрытие — максимум по источникам, спадает к краю радиуса', () => {
    const out = computeMaps({ ...base, sources: [
      { layer: 'police', x: 80, z: 80, r: 40, strength: 1, additive: false },
      { layer: 'police', x: 85, z: 80, r: 40, strength: 0.5, additive: false },
    ] });
    const c = out.layers.police;
    expect(c[10 * 20 + 10]).toBeGreaterThan(0.9);
    expect(c[10 * 20 + 10]).toBeLessThanOrEqual(1);
    expect(c[10 * 20 + 17]).toBe(0);
    expect(c[10 * 20 + 12]).toBeGreaterThan(c[10 * 20 + 14]);
  });
  it('загрязнение суммируется и ограничено единицей, стоимость земли учитывает веса', () => {
    const src = Array.from({ length: 5 }, () => ({ layer: 'pollution', x: 80, z: 80, r: 40, strength: 0.6, additive: true }));
    const out = computeMaps({ ...base, sources: [...src, { layer: 'police', x: 20, z: 20, r: 20, strength: 1, additive: false }] });
    expect(out.layers.pollution[10 * 20 + 10]).toBe(1);
    expect(out.landValue[10 * 20 + 10]).toBe(0);
    expect(out.landValue[2 * 20 + 2]).toBeGreaterThan(0.3);
    expect(out.landValue[19 * 20 + 19]).toBeCloseTo(0.3);
  });
  it('бонус у воды', () => {
    const t = new Uint8Array(100);
    t[55] = Terrain.Water;
    const s = computeShore(t, 10, 2, 0.1, Terrain.Water);
    expect(s[55]).toBeCloseTo(0.1);
    expect(s[57]).toBeCloseTo(0.1);
    expect(s[0]).toBe(0);
  });
  it('InlineCompute даёт те же результаты, что прямой вызов', async () => {
    const input = { ...base, sources: [{ layer: 'police', x: 80, z: 80, r: 40, strength: 1, additive: false }] };
    const a = await new InlineCompute().computeMaps(input);
    expect(Array.from(a.landValue)).toEqual(Array.from(computeMaps(input).landValue));
    const t = await new InlineCompute().generateTerrain(terrainParams(defaultConfig, 2, 24));
    expect(t.size).toBe(24);
  });
});

describe('звуковой микшер', () => {
  const calm: AmbientState = { zoom: 100, buildingsNear: 0, vehiclesNear: 0, industryNear: 0, waterNear: 0, trafficFlow: 1, night: 0, fires: 0, speed: 1 };
  it('в чистом поле днём слышны ветер и птицы, но не город и машины', () => {
    const m = computeMix(calm);
    expect(m.birds).toBeGreaterThan(0.3);
    expect(m.wind).toBeGreaterThan(0.2);
    expect(m.city).toBe(0);
    expect(m.traffic).toBe(0);
    expect(m.crickets).toBe(0);
  });
  it('ночью птицы сменяются сверчками', () => {
    const m = computeMix({ ...calm, night: 1 });
    expect(m.birds).toBe(0);
    expect(m.crickets).toBeGreaterThan(0.3);
  });
  it('в городе слышны город, трафик и заводы; громкость падает при отдалении камеры', () => {
    const city = { ...calm, buildingsNear: 80, vehiclesNear: 30, industryNear: 8 };
    const near = computeMix(city);
    const far = computeMix({ ...city, zoom: 600 });
    expect(near.city).toBeGreaterThan(0.6);
    expect(near.traffic).toBeGreaterThan(0.6);
    expect(near.industry).toBeGreaterThan(0.6);
    expect(far.city).toBeLessThan(near.city);
    expect(far.traffic).toBeLessThan(near.traffic);
    expect(near.birds).toBe(0);
  });
  it('пробки усиливают шум трафика, пауза приглушает, сирена включается при пожаре', () => {
    const t = { ...calm, buildingsNear: 40, vehiclesNear: 10 };
    expect(computeMix({ ...t, trafficFlow: 0.3 }).traffic).toBeGreaterThan(computeMix(t).traffic);
    expect(computeMix({ ...t, speed: 0 }).city).toBeLessThan(computeMix(t).city);
    expect(computeMix(calm).siren).toBe(0);
    expect(computeMix({ ...calm, fires: 2 }).siren).toBeGreaterThan(0.3);
    for (const k of AMBIENT_LAYERS) expect(computeMix({ ...t, waterNear: 1, fires: 1 })[k]).toBeLessThanOrEqual(1);
  });
});
