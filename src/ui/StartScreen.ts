import { SaveSystem } from '../sim/SaveSystem';
import { h } from './dom';

export interface StartChoice {
  seed: number;
  load: boolean;
}

/** Стартовый экран: новая игра с seed либо продолжение. */
export function showStartScreen(root: HTMLElement): Promise<StartChoice> {
  return new Promise((resolve) => {
    const save = SaveSystem.peek();
    const seedInput = h('input', { type: 'text', value: String(Math.floor(Math.random() * 99999)), class: 'seed' });
    const screen = h(
      'div',
      { class: 'start' },
      h(
        'div',
        { class: 'start-box' },
        h('h1', { text: 'CitySim 3D' }),
        h('p', { text: 'Постройте процветающий город: дороги, зоны, службы, транспорт и экономика.' }),
        save ? h('button', { class: 'btn big primary', text: `▶ Продолжить (${save.time.year}, население ≈ ${save.history.pop[save.history.pop.length - 1] ?? 0})`, onclick: () => done({ seed: save.seed, load: true }) }) : null,
        h('label', { class: 'seedrow' }, h('span', { text: 'Seed карты' }), seedInput),
        h('button', { class: 'btn big', text: '✨ Новый город', onclick: () => done({ seed: parseInt(seedInput.value, 10) || 1, load: false }) }),
      ),
    );
    const done = (c: StartChoice): void => {
      screen.remove();
      resolve(c);
    };
    root.append(screen);
  });
}
