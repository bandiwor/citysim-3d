import { TOOL_ICONS } from './map';

/** Все SVG из ./svg: имя файла → разметка. Стиль (цвета, толщина) задаёт CSS (.ico в theme.css). */
const files = import.meta.glob('./svg/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const ICONS = new Map(Object.entries(files).map(([path, svg]) => [path.slice(6, -4), svg.trim()]));

export function hasIcon(name: string): boolean {
  return ICONS.has(name);
}

/** Иконка по имени файла (без .svg); если такой нет — текстовый запасной вариант (emoji). */
export function icon(name: string | undefined, fallback = ''): HTMLElement {
  const el = document.createElement('span');
  el.className = 'icw';
  const svg = name ? ICONS.get(name) : undefined;
  if (svg) el.innerHTML = svg.replace('<svg ', '<svg class="ico" aria-hidden="true" focusable="false" ');
  else el.textContent = fallback;
  return el;
}

/** Иконка инструмента или раздела панели строительства (по id), запасной вариант — его emoji. */
export function toolIcon(id: string, fallback: string): HTMLElement {
  return icon(TOOL_ICONS[id], fallback);
}
