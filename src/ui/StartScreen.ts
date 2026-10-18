import type { AudioEngine } from '../audio/AudioEngine';
import { mergeConfig } from '../config/gameConfig';
import { LOCALES, getLocale, onLocaleChange, setLocale, t } from '../i18n';
import { SaveSystem } from '../sim/SaveSystem';
import { generateTerrain, randomStyle, STYLE_PRESETS, type TerrainStyle } from '../world/Terrain';
import { terrainParams } from '../world/Terrain';
import { h } from './dom';
import { drawTerrainPreview } from './terrainPreview';

export interface StartChoice {
  seed: number;
  load: boolean;
  /** карьера — содержимое открывается ростом города; песочница — всё доступно */
  mode: 'career' | 'sandbox';
  /** сторона карты в клетках (новый город); при загрузке берётся из сохранения */
  size: number;
  /** стиль ландшафта; undefined — старый генератор (сохранения прежних версий) */
  style?: TerrainStyle;
}

/** Размеры карты: ключ i18n и сторона в клетках. */
export const MAP_SIZES = [
  { id: 'small', size: 56 },
  { id: 'medium', size: 80 },
  { id: 'large', size: 128 },
  { id: 'huge', size: 192 },
] as const;

const PRESETS = ['random', 'balanced', 'plains', 'hilly', 'mountains', 'river', 'lakes'] as const;
const LEVELS: { key: keyof TerrainStyle; max: number }[] = [
  { key: 'mountains', max: 3 },
  { key: 'hills', max: 3 },
  { key: 'rivers', max: 3 },
  { key: 'lakes', max: 2 },
];

/** Стартовый экран: язык, новая игра (seed, размер, ландшафт с предпросмотром) либо продолжение. Первый клик разблокирует звук. */
export function showStartScreen(root: HTMLElement, saveKey: string, audio: AudioEngine): Promise<StartChoice> {
  return new Promise((resolve) => {
    const cfg = mergeConfig();
    const seedInput = h('input', { type: 'text', value: String(Math.floor(Math.random() * 99999)), class: 'seed' });
    let mapSize: number = 80;
    let preset: string = 'balanced';
    let style: TerrainStyle = { ...STYLE_PRESETS.balanced };
    const screen = h('div', { class: 'start' });
    const off = onLocaleChange(() => render());
    let timer = 0;
    const seedNum = (): number => parseInt(seedInput.value, 10) || 1;
    const done = (c: StartChoice): void => {
      off();
      clearTimeout(timer);
      audio.unlock();
      screen.remove();
      resolve(c);
    };
    const currentStyle = (): TerrainStyle => (preset === 'random' ? randomStyle(seedNum()) : style);

    const preview = h('canvas', { class: 'tp-canvas' });
    preview.width = 440;
    preview.height = 440;
    const legend = h('div', { class: 'tp-legend' });
    const refresh = (): void => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const d = generateTerrain(terrainParams(cfg, seedNum(), mapSize, currentStyle()));
        const s = drawTerrainPreview(preview, d, t('unit.m'));
        const item = (cls: string, label: string, v: number): HTMLElement => h('span', {}, h('i', { class: `dot ${cls}` }), `${label} ${Math.round(v * 100)}%`);
        legend.replaceChildren(item('tw', t('terrain.water'), s.water), item('tp', t('terrain.plain'), s.plain), item('th', t('terrain.hills'), s.hills), item('tm', t('terrain.mountains'), s.mountains));
      }, 60);
    };
    seedInput.addEventListener('input', refresh);

    const chips = (): HTMLElement => {
      const box = h('div', { class: 'tp-controls' });
      const presets = h('div', { class: 'chips' });
      for (const p of PRESETS) {
        presets.append(h('button', { class: `btn sm${preset === p ? ' active' : ''}`, text: t(`terrain.preset.${p}`), onclick: () => { preset = p; if (p !== 'random') style = { ...STYLE_PRESETS[p] }; render(); } }));
      }
      box.append(h('div', { class: 'tp-row' }, h('span', { text: t('terrain.style') }), presets));
      if (preset !== 'random') {
        for (const l of LEVELS) {
          const row = h('div', { class: 'chips' });
          for (let v = 0; v <= l.max; v++) row.append(h('button', { class: `btn sm${style[l.key] === v ? ' active' : ''}`, text: t(`terrain.${l.key}.${v}`), onclick: () => { style = { ...style, [l.key]: v }; preset = 'custom'; render(); } }));
          box.append(h('div', { class: 'tp-row' }, h('span', { text: t(`terrain.${l.key}`) }), row));
        }
      }
      return box;
    };

    const render = (): void => {
      const save = SaveSystem.peek(saveKey);
      const langs = h('div', { class: 'langs' });
      for (const l of LOCALES) langs.append(h('button', { class: `btn sm${getLocale() === l.id ? ' active' : ''}`, text: l.label, onclick: () => setLocale(l.id) }));
      const start = (mode: 'career' | 'sandbox'): void => done({ seed: seedNum(), load: false, mode, size: mapSize, style: currentStyle() });
      const menu = h(
        'div',
        { class: 'start-box' },
        langs,
        h('h1', { text: t('app.title') }),
        h('p', { text: t('start.tagline') }),
        save ? h('button', { class: 'btn big primary', text: `▶ ${t('start.continue', { year: save.time.year, pop: save.history.pop[save.history.pop.length - 1] ?? 0 })}`, onclick: () => done({ seed: save.seed, load: true, mode: save.mode ?? 'sandbox', size: save.size, style: save.ts }) }) : null,
        h('div', { class: 'seedrow' }, h('span', { text: t('start.seed') }), h('div', { class: 'seedbox' }, seedInput, h('button', { class: 'btn sm', text: '🎲', title: t('start.randomSeed'), onclick: () => { seedInput.value = String(Math.floor(Math.random() * 99999)); refresh(); } }))),
        h('div', { class: 'seedrow sizerow' }, h('span', { text: t('start.mapSize') }), h('div', { class: 'sizes' }, ...MAP_SIZES.map((m) => h('button', { class: `btn sm${mapSize === m.size ? ' active' : ''}`, text: t(`start.size.${m.id}`), title: t('start.sizeHint', { n: m.size, m: m.size * 8 }), onclick: () => { mapSize = m.size; render(); } })))),
        chips(),
        h('button', { class: 'btn big', text: `✨ ${t('start.new')}`, title: t('start.careerHint'), onclick: () => start('career') }),
        h('button', { class: 'btn big', text: `🏗️ ${t('start.sandbox')}`, title: t('start.sandboxHint'), onclick: () => start('sandbox') }),
        h('p', { class: 'dim small', text: t('start.modes') }),
      );
      const side = h('div', { class: 'tp-side' }, h('div', { class: 'tp-title', text: `${t('terrain.preview')} · ${mapSize}×${mapSize} (${mapSize * 8}×${mapSize * 8} ${t('unit.m')})` }), preview, legend);
      screen.replaceChildren(h('div', { class: 'start-layout' }, menu, side));
      refresh();
    };
    render();
    root.append(screen);
  });
}
