import type { AudioEngine } from '../audio/AudioEngine';
import { LOCALES, getLocale, onLocaleChange, setLocale, t } from '../i18n';
import { SaveSystem } from '../sim/SaveSystem';
import { h } from './dom';

export interface StartChoice {
  seed: number;
  load: boolean;
}

/** Стартовый экран: язык, новая игра с seed либо продолжение. Первый клик разблокирует звук. */
export function showStartScreen(root: HTMLElement, saveKey: string, audio: AudioEngine): Promise<StartChoice> {
  return new Promise((resolve) => {
    const seedInput = h('input', { type: 'text', value: String(Math.floor(Math.random() * 99999)), class: 'seed' });
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
          save ? h('button', { class: 'btn big primary', text: `▶ ${t('start.continue', { year: save.time.year, pop: save.history.pop[save.history.pop.length - 1] ?? 0 })}`, onclick: () => done({ seed: save.seed, load: true }) }) : null,
          h('label', { class: 'seedrow' }, h('span', { text: t('start.seed') }), seedInput),
          h('button', { class: 'btn big', text: `✨ ${t('start.new')}`, onclick: () => done({ seed: parseInt(seedInput.value, 10) || 1, load: false }) }),
        ),
      );
    };
    render();
    root.append(screen);
  });
}
