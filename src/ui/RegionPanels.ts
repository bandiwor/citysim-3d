import type { Game } from '../core/Game';
import { SPECS } from '../data/resources';
import { fmtMoney, fmtNumber, t } from '../i18n';
import type { TradeSettings } from '../sim/TradeSystem';
import { h } from './dom';

const kv = (k: string, v: string, cls = ''): HTMLElement => h('div', { class: `trow ${cls}` }, h('span', { text: k }), h('span', { text: v }));

/** Переключатель (как в настройках). */
function toggle(label: string, get: () => boolean, set: (v: boolean) => void): HTMLElement {
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
  return h('div', { class: 'srow' }, h('div', { class: 'srow-t' }, h('b', { text: label })), sw);
}

/** Окно «Соседи и торговля»: выезды, переключатели импорта/экспорта, потоки и баланс месяца, сырьё по видам. */
export function tradeBody(game: Game, onFocus: (x: number, z: number) => void): { el: HTMLElement; tick(): void } {
  const trade = game.get('trade');
  const info = h('div', { class: 'table' });
  const links = h('div', { class: 'trade-links' });
  // переключатели строятся один раз (иначе клик теряется при обновлении окна)
  const keys: (keyof TradeSettings)[] = ['importPower', 'importWater', 'exportPower', 'exportWater', 'exportGoods'];
  const switches = h('div', { class: 'trade-switches' }, ...keys.map((k) => toggle(t(`trade.${k}`), () => trade.settings[k], (v) => trade.set(k, v))));
  function tick(): void {
    const m = trade.month();
    const u = game.get('utility');
    const rows: HTMLElement[] = [];
    if (!trade.connected) rows.push(h('div', { class: 'edu-tip', text: `💡 ${t('trade.noLinks')}` }));
    rows.push(
      h('h4', { text: t('trade.flows') }),
      kv(t('trade.powerSold'), `${fmtNumber(u.powerExport)} → ${fmtMoney(m.powerSold)}`),
      kv(t('trade.waterSold'), `${fmtNumber(u.waterExport)} → ${fmtMoney(m.waterSold)}`),
      kv(t('trade.goods'), fmtMoney(m.goods)),
      kv(t('trade.powerBought'), `${fmtNumber(u.powerImport)} → −${fmtMoney(m.powerBought)}`, m.powerBought > 0 ? 'neg' : ''),
      kv(t('trade.waterBought'), `${fmtNumber(u.waterImport)} → −${fmtMoney(m.waterBought)}`, m.waterBought > 0 ? 'neg' : ''),
      kv(t('trade.balance'), fmtMoney(m.income - m.expense), m.income - m.expense < 0 ? 'neg' : 'pos'),
    );
    const res = game.get('resources');
    if (res) {
      const c = res.counts();
      rows.push(h('h4', { text: t('trade.industry') }));
      for (const s of SPECS) rows.push(kv(`${s.icon} ${t(`spec.${s.id}.name`)}`, t('trade.specRow', { n: c[s.id].buildings, w: fmtNumber(c[s.id].workers) })));
      rows.push(h('div', { class: 'dim', text: t('trade.industryHint') }));
    }
    info.replaceChildren(...rows);
    // выезды по сторонам света с именами соседей; клик — показать на карте
    const bySide = new Map<string, typeof trade.links>();
    for (const l of trade.links) bySide.set(l.side, [...(bySide.get(l.side) ?? []), l]);
    links.replaceChildren(
      h('h4', { text: t('trade.links', { n: trade.links.length }) }),
      ...[...bySide].map(([side, ls]) =>
        h('button', { class: 'btn wide', onclick: () => onFocus(ls[0].x, ls[0].z) }, h('span', { text: `${t(`side.${side}`)} · ${t(trade.neighbors[side as 'n'])}` }), h('span', { class: 'dim', text: ` ×${ls.length}` })),
      ),
    );
  }
  tick();
  return { el: h('div', { class: 'trade' }, links, info, h('h4', { text: t('trade.settings') }), switches, h('div', { class: 'dim', text: t('trade.how') })), tick };
}

/** Окно «Туризм»: поток, места, выручка, множители и лучшие достопримечательности. */
export function tourismBody(game: Game, onFocus: (x: number, z: number) => void): { el: HTMLElement; tick(): void } {
  const tour = game.get('tourism');
  const el = h('div', { class: 'table tourism' });
  function tick(): void {
    const f = tour.factors();
    const beds = tour.beds();
    const want = tour.demand();
    const rows: HTMLElement[] = [
      kv(t('tour.tourists'), fmtNumber(tour.tourists)),
      kv(t('tour.demand'), fmtNumber(want)),
      kv(t('tour.beds'), fmtNumber(beds), want > beds * 1.05 ? 'neg' : ''),
      kv(t('tour.income'), fmtMoney(tour.income()), 'pos'),
      h('h4', { text: t('tour.factors') }),
      kv(t('tour.base'), fmtNumber(f.base)),
      kv(t('tour.happiness'), `×${f.happiness.toFixed(2)}`),
      kv(t('tour.safety'), `×${f.safety.toFixed(2)}`),
      kv(t('tour.season'), `×${f.season.toFixed(2)}`),
      kv(t('tour.access'), f.access ? `×${f.access.toFixed(2)}` : t('tour.noAccess'), f.access ? '' : 'neg'),
    ];
    const tips: string[] = [];
    if (!f.access) tips.push(t('tour.tip.access'));
    if (f.base < 10) tips.push(t('tour.tip.attractions'));
    if (want > beds * 1.05) tips.push(t('tour.tip.beds'));
    if (f.safety < 0.85) tips.push(t('tour.tip.safety'));
    rows.push(...tips.map((x) => h('div', { class: 'edu-tip', text: `💡 ${x}` })));
    const top = tour.attractions().slice(0, 8);
    rows.push(h('h4', { text: t('tour.top') }));
    if (!top.length) rows.push(h('div', { class: 'dim', text: t('tour.none') }));
    for (const a of top) {
      const b = game.world.buildings.get(a.id);
      rows.push(
        h('button', { class: 'btn wide', onclick: () => b && onFocus(b.x, b.z) }, h('span', { text: `${game.services.require(a.defId).icon} ${t(`service.${a.defId}.name`)}` }), h('span', { class: 'dim', text: ` · ${fmtNumber(a.points)}` })),
      );
    }
    rows.push(h('div', { class: 'dim', text: t('tour.how') }));
    el.replaceChildren(...rows);
  }
  tick();
  return { el, tick };
}

/** Подпись погоды для часов и подсказки: «Дождь · 8°C · Весна». */
export function weatherLabel(game: Game): string {
  const w = game.get('weather');
  if (!w) return '';
  return `${t(`weather.${w.kind}`)} · ${w.temperature()}°C · ${t(`season.${w.season()}`)}`;
}

