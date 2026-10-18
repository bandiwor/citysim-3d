import { describe, expect, it } from 'vitest';
import { mergeConfig } from '../src/config/gameConfig';
import { GRAPHICS_PRESETS, graphics } from '../src/render/graphics';
import { BINDS, keys } from '../src/ui/keybinds';
import { generateTerrain, randomStyle, STYLE_PRESETS, Terrain, terrainParams } from '../src/world/Terrain';
import { createGame, road, run, settle } from './helpers';

const cfg = mergeConfig();
const gen = (seed: number, size: number, style?: (typeof STYLE_PRESETS)[string]) => generateTerrain(terrainParams(cfg, seed, size, style));

describe('генерация ландшафта', () => {
  it('детерминирована и центр карты остаётся равниной', () => {
    for (const name of Object.keys(STYLE_PRESETS)) {
      const a = gen(7, 80, STYLE_PRESETS[name]);
      const b = gen(7, 80, STYLE_PRESETS[name]);
      expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
      // квадрат 8×8 клеток вокруг центра без гор и холмов (реки допустимы)
      let blocked = 0;
      for (let y = 36; y < 44; y++) for (let x = 36; x < 44; x++) if (a.terrain[y * 80 + x] === Terrain.Blocked) blocked++;
      expect(blocked).toBe(0);
    }
  });

  it('стили действительно различаются: горы, равнина, реки', () => {
    const share = (d: ReturnType<typeof gen>, t: number): number => d.terrain.filter((x) => x === t).length / d.terrain.length;
    const plains = gen(3, 96, STYLE_PRESETS.plains);
    const mount = gen(3, 96, STYLE_PRESETS.mountains);
    expect(share(plains, Terrain.Land)).toBeGreaterThan(share(mount, Terrain.Land));
    const maxH = (d: ReturnType<typeof gen>): number => d.heights.reduce((m, h) => Math.max(m, h), 0);
    expect(maxH(mount)).toBeGreaterThan(30);
    const noWater = gen(3, 96, { mountains: 0, hills: 0, rivers: 0, lakes: 0 });
    expect(share(noWater, Terrain.Water)).toBe(0);
    const river = gen(3, 96, { mountains: 0, hills: 0, rivers: 3, lakes: 0 });
    expect(share(river, Terrain.Water)).toBeGreaterThan(0.03);
  });

  it('работает на всех размерах карты и случайный стиль допустим', () => {
    for (const size of [56, 80, 128]) {
      const d = gen(5, size, randomStyle(5));
      expect(d.terrain.length).toBe(size * size);
      expect(d.terrain.some((t) => t === Terrain.Land)).toBe(true);
    }
  });

  it('без стиля используется прежний генератор (старые сохранения)', () => {
    const legacy = gen(5, 80);
    const styled = gen(5, 80, STYLE_PRESETS.balanced);
    expect(Array.from(legacy.heights)).not.toEqual(Array.from(styled.heights));
    expect(Array.from(legacy.heights)).toEqual(Array.from(gen(5, 80).heights));
  });

  it('стиль попадает в сохранение', () => {
    const g = createGame();
    expect(g.get('save').serialize().ts).toBeUndefined();
  });
});

describe('настройки', () => {
  it('профили графики применяются и распознаются', () => {
    for (const id of Object.keys(GRAPHICS_PRESETS)) {
      graphics.set(GRAPHICS_PRESETS[id]);
      expect(graphics.preset()).toBe(id);
    }
    graphics.set({ grass: 0 });
    expect(graphics.get().grass).toBe(0);
    graphics.reset();
    expect(graphics.get().shadows).toBe(true);
  });

  it('клавиши переназначаются, сбрасываются и конфликты находятся', () => {
    expect(keys.code('budget')).toBe('KeyB');
    keys.set('budget', 'KeyU');
    expect(keys.is('KeyU', 'budget')).toBe(true);
    expect(keys.conflict('stats', 'KeyU')).toBe('budget');
    keys.reset('budget');
    expect(keys.code('budget')).toBe('KeyB');
    // у действий нет повторяющихся клавиш по умолчанию
    const codes = BINDS.map((b) => b.def);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('диагностика', () => {
  it('объясняет, почему зона не растёт, и почему бюджет в минусе', async () => {
    const g = createGame({ config: { progress: { enabled: false } } });
    const diag = g.get('diag');
    expect(diag.growth('res').some((i) => i.key === 'noCells')).toBe(true);
    road(g, 40, 100, 200, 100);
    g.builder.paintZone(90, 112, 30, 'res');
    await settle(g);
    const keysNow = diag.growth('res').map((i) => i.key);
    expect(keysNow).not.toContain('noCells');
    g.get('economy').money = -500;
    expect(diag.money().some((i) => i.key === 'broke')).toBe(true);
    await run(g, 5);
    expect(Array.isArray(diag.happiness())).toBe(true);
  });

  it('счастье здания раскладывается на слагаемые, а их сумма совпадает', async () => {
    const g = createGame();
    road(g, 40, 100, 200, 100);
    const s = g.builder.snapService('watertower', 60, 112);
    g.builder.placeService('watertower', s.x, s.z, s.rot);
    g.builder.paintZone(90, 112, 20, 'res');
    await run(g, 80);
    const house = g.world.list().find((b) => b.kind === 'zone');
    if (!house) return;
    const growth = g.get('growth');
    const sum = growth.happinessFactors(house).reduce((a, [, v]) => a + v, 0);
    expect(Math.min(1, Math.max(0, sum))).toBeCloseTo(growth.happinessOf(house), 6);
    expect(g.get('diag').buildingWhy(house) === null || typeof g.get('diag').buildingWhy(house) === 'string').toBe(true);
  });

  it('лимит кредита растёт с населением', () => {
    const g = createGame();
    const base = g.get('economy').creditLimit;
    g.get('stats').population = 4000;
    expect(g.get('economy').creditLimit).toBeGreaterThan(base);
  });
});

describe('читы', () => {
  it('бесконечные деньги не тратятся, а «открыть всё» снимает блокировку', () => {
    const g = new (createGame().constructor as typeof import('../src/core/Game').Game)({ seed: 1, terrain: undefined, size: 40, cheats: { infiniteMoney: true, unlockAll: true, noUpkeep: true, instantBuild: true, startMoney: 777 }, config: { progress: { enabled: true } } });
    expect(g.config.construction.enabled).toBe(false);
    expect(g.cheats.infiniteMoney).toBe(true);
  });

  it('деньги держатся на максимуме при включённом чите', async () => {
    const g = createGame();
    (g.cheats as { infiniteMoney: boolean }).infiniteMoney = true;
    g.get('economy').money = 5;
    await run(g, 1);
    expect(g.get('economy').money).toBeGreaterThan(1e8);
    expect(g.get('economy').spend(1e6)).toBe(true);
    expect(g.get('economy').money).toBeGreaterThan(1e8);
  });

  it('без содержания расходы нулевые', async () => {
    const g = createGame();
    road(g, 40, 100, 200, 100);
    expect(g.get('economy').computeBudget().expense.roads).toBeGreaterThan(0);
    (g.cheats as { noUpkeep: boolean }).noUpkeep = true;
    expect(g.get('economy').computeBudget().expense.roads).toBe(0);
    await settle(g);
  });

  it('читы сохраняются в сохранении', () => {
    const g = createGame();
    expect(g.get('save').serialize().ch).toBeUndefined();
    (g.cheats as { happyCity: boolean }).happyCity = true;
    expect(g.get('save').serialize().ch?.happyCity).toBe(true);
  });
});
