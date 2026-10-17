import type { Game } from '../core/Game';
import { fmtMoney, fmtNumber, t } from '../i18n';
import { h } from './dom';

export interface RouteActions {
  create(): void;
  edit(id: number): void;
  track(id: number): void;
  focus(id: number): void;
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Окно маршрутов: список, статус, число автобусов, пассажиры, слежение за автобусом. */
export function routesBody(game: Game, actions: RouteActions): { el: HTMLElement; tick(): void } {
  const tr = game.get('transit');
  const list = h('div', { class: 'routes' });
  const head = h('div', { class: 'routes-head' });
  const depots = (): number => game.get('fleet').facilities('bus').length;

  function tick(): void {
    head.replaceChildren(
      h('button', { class: 'btn', text: `➕ ${t('routes.new')}`, onclick: actions.create }),
      h('button', { class: `btn${tr.showRoutes ? ' active' : ''}`, text: `🗺️ ${t('routes.show')}`, onclick: () => { tr.showRoutes = !tr.showRoutes; actions.focus(0); tick(); } }),
      h('span', { class: 'dim', text: t('routes.summary', { depots: depots(), stops: tr.stops.length, buses: tr.busesAlive(), waiting: fmtNumber(tr.waitingTotal()) }) }),
    );
    if (!depots()) head.append(h('div', { class: 'warn-line', text: `⚠️ ${t('routes.noDepotHint')}` }));
    list.replaceChildren();
    if (!tr.routes.length) list.append(h('p', { class: 'dim', text: t('routes.empty') }));
    for (const r of tr.routes) {
      const alive = r.fleet.filter((v) => !v.dead).length;
      list.append(
        h(
          'div',
          { class: 'route-row' },
          h('span', { class: 'chip', style: `background:${hex(r.color)}` }),
          h('div', { class: 'route-main' },
            h('b', { text: t('routes.name', { n: r.id }) }),
            h('span', { class: `status ${r.status}`, text: t(`routes.status.${r.status}`) }),
            h('span', { class: 'dim', text: t('routes.stats', { stops: r.stops.length, buses: alive, wanted: r.buses, waiting: fmtNumber(tr.waitingOnRoute(r)), carried: fmtNumber(r.carried) }) }),
          ),
          h('div', { class: 'route-btns' },
            h('button', { class: 'btn sm', text: '−', title: t('routes.fewer'), onclick: () => { tr.setBuses(r.id, r.buses - 1); tick(); } }),
            h('span', { class: 'cnt', text: String(r.buses) }),
            h('button', { class: 'btn sm', text: '+', title: t('routes.more'), onclick: () => { tr.setBuses(r.id, r.buses + 1); tick(); } }),
            h('button', { class: 'btn sm', text: '👁', title: t('routes.track'), onclick: () => actions.track(r.id) }),
            h('button', { class: 'btn sm', text: '✏️', title: t('routes.edit'), onclick: () => actions.edit(r.id) }),
            h('button', { class: 'btn sm danger', text: '🗑', title: t('routes.delete'), onclick: () => { tr.deleteRoute(r.id); tick(); } }),
          ),
        ),
      );
    }
  }
  tick();
  return { el: h('div', { class: 'routes-panel' }, head, list), tick };
}

/** Окно городских служб: мусор, кладбища, преступность. */
export function cityBody(game: Game): { el: HTMLElement; tick(): void } {
  const info = h('div', { class: 'table' });
  const kv = (k: string, v: string, cls = ''): HTMLElement => h('div', { class: `trow ${cls}` }, h('span', { text: k }), h('span', { text: v }));
  function tick(): void {
    const s = game.get('sanitation');
    const c = game.get('crime');
    const fleet = game.get('fleet');
    const count = (id: string): number => game.world.list().filter((b) => b.defId === id).length;
    info.replaceChildren(
      h('h4', { text: `🗑️ ${t('city.garbage')}` }),
      kv(t('city.garbageTotal'), fmtNumber(Math.round(s.garbageTotal))),
      kv(t('city.overflowing'), fmtNumber(s.overflowing), s.overflowing ? 'neg' : ''),
      kv(t('city.wasteFill'), `${Math.round(s.wasteFill * 100)}%`, s.wasteFill > 0.9 ? 'neg' : ''),
      kv(t('city.sites'), `${count('landfill')} + ${count('incinerator')}`),
      h('h4', { text: `⚰️ ${t('city.dead')}` }),
      kv(t('city.bodies'), fmtNumber(s.bodiesWaiting), s.bodiesWaiting > 5 ? 'neg' : ''),
      kv(t('city.deaths'), fmtNumber(s.deathsMonth)),
      kv(t('city.morgueFill'), `${Math.round(s.morgueFill * 100)}%`, s.morgueFill > 0.9 ? 'neg' : ''),
      kv(t('city.cemeteries'), `${count('cemetery')} + ${count('crematorium')}`),
      h('h4', { text: `🚨 ${t('city.crime')}` }),
      kv(t('city.active'), fmtNumber(c.active.length)),
      kv(t('city.robberies'), fmtNumber(c.robberies)),
      kv(t('city.caught'), fmtNumber(c.caught)),
      kv(t('city.loot'), fmtMoney(c.lootMonth)),
      kv(t('city.police'), `${fleet.facilities('police').length}`),
    );
  }
  tick();
  return { el: h('div', {}, info), tick };
}
