import { en } from './en';
import { ru } from './ru';

export type Locale = 'ru' | 'en';
export type TKey = keyof typeof en;
export type Params = Record<string, string | number>;

export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
];

const dictionaries: Record<Locale, Record<string, string>> = { en, ru };
const STORAGE_KEY = 'citysim3d.locale';
let current: Locale = 'en';
const listeners = new Set<(l: Locale) => void>();

/** Язык по умолчанию: сохранённый выбор, иначе язык браузера. */
export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {
    /* хранилище недоступно */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return nav.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(l: Locale): void {
  current = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  for (const fn of listeners) fn(l);
}

export function onLocaleChange(fn: (l: Locale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Есть ли ключ в словаре выбранного языка. */
export function hasKey(key: string, l: Locale = current): boolean {
  return key in dictionaries[l];
}

/** Перевод по ключу с подстановкой `{name}`. Если ключа нет — возвращается сам ключ. */
export function t(key: TKey | (string & {}), params?: Params): string {
  const str = dictionaries[current][key] ?? dictionaries.en[key] ?? key;
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

export const fmtNumber = (n: number): string => Math.round(n).toLocaleString(current === 'ru' ? 'ru-RU' : 'en-US');
export const fmtMoney = (n: number): string => `${n < 0 ? '−' : ''}${t('unit.money')}${fmtNumber(Math.abs(n))}`;
export const fmtSigned = (n: number): string => `${n < 0 ? '−' : '+'}${fmtNumber(Math.abs(n))}`;
export const fmtPercent = (v: number): string => `${Math.round(v * 100)}%`;

/** Ключи для данных реестров: имя и описание дороги/зоны/службы лежат в словаре по соглашению. */
export const nameKey = (kind: 'road' | 'zone' | 'service' | 'overlay' | 'category' | 'tool', id: string): string => `${kind}.${id}.name`;
export const descKey = (kind: 'road' | 'zone' | 'service' | 'tool', id: string): string => `${kind}.${id}.desc`;

export const dictionariesForTests = dictionaries;
