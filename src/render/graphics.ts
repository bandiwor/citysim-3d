/** Настройки графики и интерфейса: хранятся в localStorage, применяются сразу, доступны всем видам. */
export interface GraphicsSettings {
  shadows: boolean;
  /** размер карты теней: 0 — 1024, 1 — 2048, 2 — 4096 */
  shadowQuality: number;
  /** масштаб отрисовки, 0.5..1 (1 = родное разрешение) */
  renderScale: number;
  /** 0 — нет, 1 — немного, 2 — много */
  grass: number;
  trees: boolean;
  fog: boolean;
  dayNight: boolean;
  fps: boolean;
  /** масштаб интерфейса, 0.8..1.4 */
  uiScale: number;
  /** множители управления камерой */
  panSpeed: number;
  rotateSpeed: number;
  zoomSpeed: number;
}

export const GRAPHICS_DEFAULTS: GraphicsSettings = {
  shadows: true,
  shadowQuality: 1,
  renderScale: 1,
  grass: 1,
  trees: true,
  fog: true,
  dayNight: true,
  fps: false,
  uiScale: 1,
  panSpeed: 1,
  rotateSpeed: 1,
  zoomSpeed: 1,
};

/** Готовые профили качества. */
export const GRAPHICS_PRESETS: Record<string, Partial<GraphicsSettings>> = {
  low: { shadows: false, shadowQuality: 0, renderScale: 0.7, grass: 0, trees: true, fog: true },
  medium: { shadows: true, shadowQuality: 0, renderScale: 0.85, grass: 1, trees: true, fog: true },
  high: { shadows: true, shadowQuality: 1, renderScale: 1, grass: 1, trees: true, fog: true },
  ultra: { shadows: true, shadowQuality: 2, renderScale: 1, grass: 2, trees: true, fog: true },
};

const KEY = 'citysim3d.graphics.v1';
let current: GraphicsSettings = { ...GRAPHICS_DEFAULTS };
try {
  current = { ...GRAPHICS_DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<GraphicsSettings>) };
} catch {
  current = { ...GRAPHICS_DEFAULTS };
}
const listeners = new Set<(g: GraphicsSettings) => void>();

export const graphics = {
  get(): GraphicsSettings {
    return current;
  },
  set(patch: Partial<GraphicsSettings>): void {
    current = { ...current, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      /* без хранилища настройки действуют до перезагрузки */
    }
    for (const f of listeners) f(current);
  },
  reset(): void {
    this.set({ ...GRAPHICS_DEFAULTS });
  },
  /** какому профилю соответствуют текущие настройки (или 'custom') */
  preset(): string {
    for (const [id, p] of Object.entries(GRAPHICS_PRESETS)) {
      if ((Object.keys(p) as (keyof GraphicsSettings)[]).every((k) => current[k] === p[k])) return id;
    }
    return 'custom';
  },
  onChange(fn: (g: GraphicsSettings) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
