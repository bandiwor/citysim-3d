import type { AudioChannel, AudioEngine } from '../audio/AudioEngine';
import type { Game } from '../core/Game';
import { getLocale, LOCALES, t, type Locale } from '../i18n';
import { GRAPHICS_PRESETS, graphics, type GraphicsSettings } from '../render/graphics';
import { BUILD_LABEL, pwa } from '../pwa';
import { h } from './dom';
import { BINDS, keyLabel, keys } from './keybinds';
import { slider } from './Panels';

export interface SettingsDeps {
  game: Game;
  audio: AudioEngine;
  onLocale?: (l: Locale) => void;
}

const TABS = ['general', 'graphics', 'controls', 'audio'] as const;
type Tab = (typeof TABS)[number];
let lastTab: Tab = 'general';

/** Окно настроек во вкладках: общие, графика, управление (сочетания клавиш), звук. */
export function settingsBody(d: SettingsDeps): HTMLElement {
  const root = h('div', { class: 'settings-box' });
  const tabs = h('div', { class: 'tabs' });
  const body = h('div', { class: 'tab-body' });
  root.append(tabs, body);

  const toggle = (label: string, hint: string, get: () => boolean, set: (v: boolean) => void): HTMLElement => {
    const sw = h('button', { class: 'switch' });
    const upd = (): void => {
      sw.classList.toggle('on', get());
      sw.setAttribute('aria-pressed', String(get()));
    };
    sw.addEventListener('click', () => {
      set(!get());
      upd();
    });
    upd();
    return h('div', { class: 'srow' }, h('div', { class: 'srow-t' }, h('b', { text: label }), hint ? h('span', { class: 'dim', text: hint }) : null), sw);
  };
  const choice = (label: string, hint: string, opts: { id: string; label: string }[], get: () => string, set: (v: string) => void): HTMLElement => {
    const row = h('div', { class: 'chips' });
    const upd = (): void => {
      for (const [i, o] of opts.entries()) (row.children[i] as HTMLElement).classList.toggle('active', o.id === get());
    };
    for (const o of opts) row.append(h('button', { class: 'btn sm', text: o.label, onclick: () => { set(o.id); upd(); } }));
    upd();
    return h('div', { class: 'srow col' }, h('div', { class: 'srow-t' }, h('b', { text: label }), hint ? h('span', { class: 'dim', text: hint }) : null), row);
  };
  const g = (): GraphicsSettings => graphics.get();
  const vol = (ch: AudioChannel): HTMLElement => slider(t(`settings.vol.${ch}`), 0, 100, Math.round(d.audio.volume(ch) * 100), '%', (v) => d.audio.setVolume(ch, v / 100));

  /** Установка приложения, офлайн-режим и обновления. */
  const appBlock = (): HTMLElement => {
    const box = h('div', { class: 'app-box' });
    const status = h('span', { class: 'dim small' });
    const draw = (): void => {
      box.replaceChildren(h('h4', { text: t('settings.app') }));
      const rows: HTMLElement[] = [];
      rows.push(h('div', { class: 'srow' }, h('div', { class: 'srow-t' }, h('b', { text: t('pwa.offline') }), h('span', { class: 'dim', text: pwa.offlineReady ? t('pwa.offline.ready') : pwa.supported ? t('pwa.offline.pending') : t('pwa.offline.na') })), h('span', { text: pwa.offlineReady ? '✅' : '⏳' })));
      if (pwa.standalone) rows.push(h('div', { class: 'srow' }, h('div', { class: 'srow-t' }, h('b', { text: t('pwa.installed') })), h('span', { text: '✅' })));
      else if (pwa.installable) rows.push(h('div', { class: 'srow' }, h('div', { class: 'srow-t' }, h('b', { text: t('pwa.install') }), h('span', { class: 'dim', text: t('pwa.install.hint') })), h('button', { class: 'btn sm primary', text: `⬇ ${t('pwa.installBtn')}`, onclick: () => void pwa.install() })));
      else rows.push(h('div', { class: 'srow' }, h('div', { class: 'srow-t' }, h('b', { text: t('pwa.install') }), h('span', { class: 'dim', text: t('pwa.install.manual') }))));
      const upd = pwa.updateReady
        ? h('button', { class: 'btn sm primary', text: `🔄 ${t('pwa.applyUpdate')}`, onclick: () => pwa.applyUpdate() })
        : h('button', { class: 'btn sm', text: t('pwa.check'), onclick: async () => {
            status.textContent = t('pwa.checking');
            const r = await pwa.checkUpdate();
            status.textContent = t(`pwa.result.${r}`);
            if (r === 'ready') draw();
          } });
      rows.push(h('div', { class: 'srow' }, h('div', { class: 'srow-t' }, h('b', { text: t('pwa.version') }), h('span', { class: 'dim', text: `${t('pwa.build')}: ${BUILD_LABEL}` }), status), upd));
      box.append(...rows);
    };
    draw();
    return box;
  };

  const general = (): HTMLElement => {
    const lang = h('select', { class: 'select', onchange: (e) => d.onLocale?.((e.target as HTMLSelectElement).value as Locale) });
    for (const l of LOCALES) lang.append(h('option', { value: l.id, text: l.label }));
    lang.value = getLocale();
    return h(
      'div',
      { class: 'tab-pane' },
      h('div', { class: 'srow' }, h('div', { class: 'srow-t' }, h('b', { text: t('settings.language') })), lang),
      slider(t('settings.uiScale'), 80, 140, Math.round(g().uiScale * 100), '%', (v) => graphics.set({ uiScale: v / 100 })),
      toggle(t('settings.fps'), t('settings.fps.hint'), () => g().fps, (v) => graphics.set({ fps: v })),
      appBlock(),
      h('h4', { text: t('settings.gameplay') }),
      toggle(t('settings.fires'), t('settings.fires.hint'), () => d.game.get('disaster').enabled, (v) => (d.game.get('disaster').enabled = v)),
      toggle(t('settings.dayNight'), t('settings.dayNight.hint'), () => g().dayNight, (v) => graphics.set({ dayNight: v })),
    );
  };

  const graphicsTab = (): HTMLElement => {
    const presets = h('div', { class: 'chips' });
    const upd = (): void => {
      const cur = graphics.preset();
      for (const b of Array.from(presets.children) as HTMLElement[]) b.classList.toggle('active', b.dataset.id === cur);
    };
    for (const id of Object.keys(GRAPHICS_PRESETS)) {
      const b = h('button', { class: 'btn sm', text: t(`settings.preset.${id}`), onclick: () => { graphics.set(GRAPHICS_PRESETS[id]); render(); } });
      b.dataset.id = id;
      presets.append(b);
    }
    upd();
    const lvl = (n: number): string => ['0', '1', '2', '3'][n];
    return h(
      'div',
      { class: 'tab-pane' },
      h('div', { class: 'srow col' }, h('div', { class: 'srow-t' }, h('b', { text: t('settings.preset') }), h('span', { class: 'dim', text: t('settings.preset.hint') })), presets),
      toggle(t('settings.shadows'), t('settings.shadows.hint'), () => g().shadows, (v) => { graphics.set({ shadows: v }); upd(); }),
      choice(t('settings.shadowQuality'), '', [0, 1, 2].map((n) => ({ id: lvl(n), label: t(`settings.q.${n}`) })), () => lvl(g().shadowQuality), (v) => { graphics.set({ shadowQuality: +v }); upd(); }),
      slider(t('settings.renderScale'), 50, 100, Math.round(g().renderScale * 100), '%', (v) => { graphics.set({ renderScale: v / 100 }); upd(); }),
      choice(t('settings.grass'), t('settings.grass.hint'), [0, 1, 2].map((n) => ({ id: lvl(n), label: t(`settings.grass.${n}`) })), () => lvl(g().grass), (v) => { graphics.set({ grass: +v }); upd(); }),
      toggle(t('settings.trees'), t('settings.trees.hint'), () => g().trees, (v) => { graphics.set({ trees: v }); upd(); }),
      toggle(t('settings.fog'), t('settings.fog.hint'), () => g().fog, (v) => { graphics.set({ fog: v }); upd(); }),
    );
  };

  const controlsTab = (): HTMLElement => {
    const pane = h('div', { class: 'tab-pane' });
    pane.append(
      slider(t('settings.panSpeed'), 30, 250, Math.round(g().panSpeed * 100), '%', (v) => graphics.set({ panSpeed: v / 100 })),
      slider(t('settings.rotateSpeed'), 30, 250, Math.round(g().rotateSpeed * 100), '%', (v) => graphics.set({ rotateSpeed: v / 100 })),
      slider(t('settings.zoomSpeed'), 30, 250, Math.round(g().zoomSpeed * 100), '%', (v) => graphics.set({ zoomSpeed: v / 100 })),
      h('div', { class: 'dim small', text: t('settings.keys.hint') }),
    );
    const groups = ['camera', 'game', 'windows', 'tools'] as const;
    for (const grp of groups) {
      pane.append(h('h4', { text: t(`settings.keys.${grp}`) }));
      for (const b of BINDS.filter((x) => x.group === grp)) {
        const btn = h('button', { class: `btn sm key${keys.isCustom(b.id) ? ' custom' : ''}`, text: keyLabel(keys.code(b.id)) });
        btn.addEventListener('click', () => {
          btn.textContent = t('settings.keys.press');
          btn.classList.add('listening');
          const on = (e: KeyboardEvent): void => {
            e.preventDefault();
            e.stopPropagation();
            window.removeEventListener('keydown', on, true);
            btn.classList.remove('listening');
            if (e.code !== 'Escape') {
              const other = keys.conflict(b.id, e.code);
              if (other) {
                // обмен: занятая клавиша переходит действию, которое освобождается
                keys.set(other, keys.code(b.id));
              }
              keys.set(b.id, e.code);
            }
            render();
          };
          window.addEventListener('keydown', on, true);
        });
        pane.append(h('div', { class: 'srow' }, h('div', { class: 'srow-t' }, h('b', { text: t(`bind.${b.id}`) })), h('div', { class: 'row-btns' }, btn, keys.isCustom(b.id) ? h('button', { class: 'btn sm', text: '↺', title: t('settings.keys.reset'), onclick: () => { keys.reset(b.id); render(); } }) : null)));
      }
    }
    pane.append(h('button', { class: 'btn wide', text: t('settings.keys.resetAll'), onclick: () => { keys.reset(); render(); } }));
    return pane;
  };

  const audioTab = (): HTMLElement => h('div', { class: 'tab-pane' }, vol('master'), vol('ambient'), vol('sfx'), vol('music'));

  function render(): void {
    tabs.replaceChildren(...TABS.map((id) => h('button', { class: `tab${id === lastTab ? ' active' : ''}`, text: t(`settings.tab.${id}`), onclick: () => { lastTab = id; render(); } })));
    const scroll = body.scrollTop;
    body.replaceChildren(lastTab === 'general' ? general() : lastTab === 'graphics' ? graphicsTab() : lastTab === 'controls' ? controlsTab() : audioTab());
    body.scrollTop = scroll;
  }
  render();
  return root;
}
