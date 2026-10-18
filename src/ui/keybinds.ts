/** Сочетания клавиш: реестр действий, настройки игрока (localStorage) и проверка нажатия. */
export interface Bind {
  id: string;
  group: 'camera' | 'windows' | 'game' | 'tools';
  /** клавиша по умолчанию (KeyboardEvent.code) */
  def: string;
}

export const BINDS: Bind[] = [
  { id: 'panUp', group: 'camera', def: 'KeyW' },
  { id: 'panDown', group: 'camera', def: 'KeyS' },
  { id: 'panLeft', group: 'camera', def: 'KeyA' },
  { id: 'panRight', group: 'camera', def: 'KeyD' },
  { id: 'rotateLeft', group: 'camera', def: 'KeyQ' },
  { id: 'rotateRight', group: 'camera', def: 'KeyE' },
  { id: 'tiltUp', group: 'camera', def: 'KeyR' },
  { id: 'tiltDown', group: 'camera', def: 'KeyF' },
  { id: 'zoomIn', group: 'camera', def: 'Equal' },
  { id: 'zoomOut', group: 'camera', def: 'Minus' },
  { id: 'pause', group: 'game', def: 'Space' },
  { id: 'speed1', group: 'game', def: 'Digit1' },
  { id: 'speed2', group: 'game', def: 'Digit2' },
  { id: 'speed3', group: 'game', def: 'Digit3' },
  { id: 'walk', group: 'game', def: 'KeyP' },
  { id: 'budget', group: 'windows', def: 'KeyB' },
  { id: 'stats', group: 'windows', def: 'KeyG' },
  { id: 'routes', group: 'windows', def: 'KeyT' },
  { id: 'education', group: 'windows', def: 'KeyY' },
  { id: 'goals', group: 'windows', def: 'KeyJ' },
  { id: 'policies', group: 'windows', def: 'KeyK' },
  { id: 'city', group: 'windows', def: 'KeyH' },
  { id: 'diagnostics', group: 'windows', def: 'KeyN' },
  { id: 'settings', group: 'windows', def: 'KeyO' },
  { id: 'bulldoze', group: 'tools', def: 'KeyX' },
  { id: 'dezone', group: 'tools', def: 'KeyZ' },
  { id: 'curve', group: 'tools', def: 'KeyC' },
  { id: 'snap', group: 'tools', def: 'KeyV' },
];

const KEY = 'citysim3d.keys.v1';
let overrides: Record<string, string> = {};
try {
  overrides = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>;
} catch {
  overrides = {};
}
const listeners = new Set<() => void>();

export const keys = {
  /** текущий код клавиши действия */
  code(id: string): string {
    return overrides[id] ?? BINDS.find((b) => b.id === id)?.def ?? '';
  },
  /** нажата ли клавиша действия (для обработчиков keydown) */
  is(codeOrEvent: string | KeyboardEvent, id: string): boolean {
    return (typeof codeOrEvent === 'string' ? codeOrEvent : codeOrEvent.code) === this.code(id);
  },
  set(id: string, code: string): void {
    overrides[id] = code;
    this._save();
  },
  reset(id?: string): void {
    if (id) delete overrides[id];
    else overrides = {};
    this._save();
  },
  isCustom(id: string): boolean {
    return id in overrides;
  },
  /** какое другое действие уже занимает эту клавишу */
  conflict(id: string, code: string): string | null {
    return BINDS.find((b) => b.id !== id && this.code(b.id) === code)?.id ?? null;
  },
  onChange(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  _save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(overrides));
    } catch {
      /* хранилище недоступно: настройки живут до перезагрузки */
    }
    for (const f of listeners) f();
  },
};

/** Короткое название клавиши для кнопок. */
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  const map: Record<string, string> = { Space: '␣', Equal: '=', Minus: '−', Backquote: '`', BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Tab: 'Tab', Enter: 'Enter', NumpadAdd: 'Num+', NumpadSubtract: 'Num−' };
  return map[code] ?? code;
}
