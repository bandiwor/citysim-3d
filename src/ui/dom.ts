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
  checked?: boolean;
  onclick?: (e: MouseEvent) => void;
  oninput?: (e: Event) => void;
  onchange?: (e: Event) => void;
  style?: string;
}

/** Мини-хелпер создания DOM-элементов. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, text, html, onclick, oninput, onchange, style, checked, ...rest } = props;
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  if (html !== undefined) el.innerHTML = html;
  if (style) el.setAttribute('style', style);
  if (onclick) el.addEventListener('click', onclick as EventListener);
  if (oninput) el.addEventListener('input', oninput);
  if (onchange) el.addEventListener('change', onchange);
  if (checked !== undefined) (el as unknown as HTMLInputElement).checked = checked;
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) el.setAttribute(k, v as string);
  for (const c of children) if (c) el.append(c);
  return el;
}
