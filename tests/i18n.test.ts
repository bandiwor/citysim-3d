import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dictionariesForTests, fmtMoney, fmtNumber, hasKey, setLocale, t } from '../src/i18n';
import { CITY_EVENTS } from '../src/data/events';
import { createGame } from './helpers';

const en = dictionariesForTests.en;
const ru = dictionariesForTests.ru;

function sources(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('i18n', () => {
  it('русский и английский словари содержат одинаковые ключи и непустые значения', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries({ ...en, ...ru })) expect(v.length, k).toBeGreaterThan(0);
  });

  it('плейсхолдеры в переводах совпадают', () => {
    const ph = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(en)) expect(ph(ru[k]), k).toEqual(ph(en[k]));
  });

  it('подставляет параметры и возвращает ключ для неизвестных', () => {
    setLocale('en');
    expect(t('budget.takeLoan', { n: 5 })).toBe('Take loan 5');
    expect(t('no.such.key')).toBe('no.such.key');
    setLocale('ru');
    expect(t('budget.takeLoan', { n: 5 })).toBe('Взять кредит 5');
    expect(t('unit.money')).toBe('₽');
    setLocale('en');
    expect(fmtMoney(-1500)).toBe('−$1,500');
    expect(fmtNumber(1234.6)).toBe('1,235');
  });

  it('все ключи, использованные в исходниках как строковые литералы, есть в словаре', () => {
    const used = new Set<string>();
    const re = /(?:\bt\(|nameKey: |descKey: |labelKey: |reasonKey: |message\(|fail\(|bad\()\s*'([a-z][\w]*(?:\.[\w]+)+)'/g;
    const lit = /'((?:err|msg|hint|opt|tool|hud|inspector|budget|stats|settings|menu|modal|maps|hover|start|app|help|unit)\.[\w.]+)'/g;
    for (const file of sources(join(__dirname, '..', 'src'))) {
      if (file.includes('/i18n/') || file.includes('/audio/')) continue;
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(re)) used.add(m[1]);
      for (const m of text.matchAll(lit)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(60);
    const missing = [...used].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  it('есть переводы для всей зарегистрированной игровой сущности (дороги, зоны, службы, оверлеи, категории, инструменты)', () => {
    const g = createGame({ start: false });
    const keys: string[] = [];
    for (const r of g.roadTypes.all()) keys.push(`road.${r.id}.name`, `road.${r.id}.desc`);
    for (const z of g.zoneTypes.all()) keys.push(`zone.${z.id}.name`, `zone.${z.id}.desc`, `zone.${z.id}.short`);
    for (const s of g.services.all()) keys.push(`service.${s.id}.name`, `service.${s.id}.desc`);
    for (const o of g.overlays.all()) keys.push(`overlay.${o.id}.name`);
    for (const c of g.categories) keys.push(`category.${c.id}.name`);
    for (const i of g.toolbar.all()) {
      keys.push(i.nameKey);
      if (i.descKey) keys.push(i.descKey);
    }
    for (let i = 0; i < 12; i++) keys.push(`month.${i}`);
    for (const k of ['police', 'fire', 'health', 'education', 'parks', 'utilities']) keys.push(`funding.${k}`);
    for (const ch of ['master', 'ambient', 'sfx', 'music']) keys.push(`settings.vol.${ch}`);
    for (let i = 0; i < g.config.zoning.brushSizes.length; i++) keys.push(`opt.brush.${i}`);
    for (const k of keys) {
      expect(hasKey(k, 'en'), `en: ${k}`).toBe(true);
      expect(hasKey(k, 'ru'), `ru: ${k}`).toBe(true);
    }
  });

  it('есть переводы для политик, событий, уровней и эффектов', () => {
    const g = createGame();
    for (const l of ['en', 'ru'] as const) {
      setLocale(l);
      for (const p of g.policies.all()) {
        expect(hasKey(`policy.${p.id}.name`), p.id).toBe(true);
        expect(hasKey(`policy.${p.id}.desc`), p.id).toBe(true);
        for (const k of [...Object.keys(p.mul ?? {}), ...Object.keys(p.add ?? {})]) expect(hasKey(`fx.${k}`), k).toBe(true);
      }
      for (const e of CITY_EVENTS) {
        expect(hasKey(`event.${e.id}.title`), e.id).toBe(true);
        expect(hasKey(`event.${e.id}.desc`), e.id).toBe(true);
        for (const o of e.options) {
          expect(hasKey(`event.${e.id}.opt.${o.id}`), `${e.id}.${o.id}`).toBe(true);
          for (const k of [...Object.keys(o.mul ?? {}), ...Object.keys(o.add ?? {})]) expect(hasKey(`fx.${k}`), k).toBe(true);
        }
      }
      for (const lv of g.config.progress.levels) expect(hasKey(`level.${lv.id}`), lv.id).toBe(true);
      for (const key of Object.keys(g.config.progress.unlocks)) {
        const kind = key.split(':')[0];
        const id = key.slice(kind.length + 1);
        expect(hasKey(kind === 'tool' ? `tool.${id.replace(':', '.')}.name` : `${kind}.${id}.name`), key).toBe(true);
      }
    }
    setLocale('en');
  });
});
