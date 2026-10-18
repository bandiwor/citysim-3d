import type { AudioEngine } from '../audio/AudioEngine';
import { LOCALES, getLocale, onLocaleChange, setLocale, t } from '../i18n';
import { SaveSystem } from '../sim/SaveSystem';
import { h } from './dom';

export interface StartChoice {
  seed: number;
  load: boolean;
  /** карьера — содержимое открывается ростом города; песочница — всё доступно */
  mode: 'career' | 'sandbox';
  /** сторона карты в клетках (новый город); при загрузке берётся из сохранения */
  size: number;
}

/** Размеры карты: ключ i18n и сторона в клетках. */
export const MAP_SIZES = [
  { id: 'small', size: 56 },
  { id: 'medium', size: 80 },
  { id: 'large', size: 128 },
  { id: 'huge', size: 192 },
] as const;

/** Стартовый экран: язык, новая игра с seed либо продолжение. Первый клик разблокирует звук. */
export function showStartScreen(root: HTMLElement, saveKey: string, audio: AudioEngine): Promise<StartChoice> {
  return new Promise((resolve) => {
    const seedInput = h('input', { type: 'text', value: String(Math.floor(Math.random() * 99999)), class: 'seed' });
    let mapSize: number = 80;
    const screen = h('div', { class: 'start' });
    const off = onLocaleChange(() => render());
    const done = (c: StartChoice): void => {
      off();
      audio.unlock();
      screen.remove();
      resolve(c);
    };
    const render = (): void => {
      const save = SaveSystem.peek(saveKey);
      const langs = h('div', { class: 'langs' });
      for (const l of LOCALES) langs.append(h('button', { class: `btn sm${getLocale() === l.id ? ' active' : ''}`, text: l.label, onclick: () => setLocale(l.id) }));
      screen.replaceChildren(
        h(
          'div',
          { class: 'start-box' },
          langs,
          h('h1', { text: t('app.title') }),
          h('p', { text: t('start.tagline') }),
          save ? h('button', { class: 'btn big primary', text: `▶ ${t('start.continue', { year: save.time.year, pop: save.history.pop[save.history.pop.length - 1] ?? 0 })}`, onclick: () => done({ seed: save.seed, load: true, mode: save.mode ?? 'sandbox', size: save.size }) }) : null,
          h('label', { class: 'seedrow' }, h('span', { text: t('start.seed') }), seedInput),
          h('div', { class: 'seedrow sizerow' }, h('span', { text: t('start.mapSize') }), h('div', { class: 'sizes' }, ...MAP_SIZES.map((m) => h('button', { class: `btn sm${mapSize === m.size ? ' active' : ''}`, text: t(`start.size.${m.id}`), title: t('start.sizeHint', { n: m.size, m: m.size * 8 }), onclick: () => { mapSize = m.size; render(); } })))),
          h('button', { class: 'btn big', text: `✨ ${t('start.new')}`, title: t('start.careerHint'), onclick: () => done({ seed: parseInt(seedInput.value, 10) || 1, load: false, mode: 'career', size: mapSize }) }),
          h('button', { class: 'btn big', text: `🏗️ ${t('start.sandbox')}`, title: t('start.sandboxHint'), onclick: () => done({ seed: parseInt(seedInput.value, 10) || 1, load: false, mode: 'sandbox', size: mapSize }) }),
          h('p', { class: 'dim small', text: t('start.modes') }),
        ),
      );
    };
    render();
    root.append(screen);
  });
}
