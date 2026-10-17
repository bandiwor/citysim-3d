type Child = Node | string | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  html?: string;
  title?: string;
  id?: string;
  type?: string;
  value?: string;
  min?: string;
  max?: string;
  step?: string;
  onclick?: (e: MouseEvent) => void;
  oninput?: (e: Event) => void;
  style?: string;
}

/** Мини-хелпер создания DOM-элементов. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, text, html, onclick, oninput, style, ...rest } = props;
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  if (html !== undefined) el.innerHTML = html;
  if (style) el.setAttribute('style', style);
  if (onclick) el.addEventListener('click', onclick as EventListener);
  if (oninput) el.addEventListener('input', oninput);
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) el.setAttribute(k, v as string);
  for (const c of children) if (c) el.append(c);
  return el;
}

export const fmt = (n: number): string => Math.round(n).toLocaleString('ru-RU');
export const money = (n: number): string => `${n < 0 ? '−' : ''}₽${fmt(Math.abs(n))}`;
export const signed = (n: number): string => `${n < 0 ? '−' : '+'}${fmt(Math.abs(n))}`;
