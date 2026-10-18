import type { Game } from '../core/Game';
import { fmtMoney, t } from '../i18n';
import type { Issue } from '../sim/DiagnosticsSystem';
import { h } from './dom';

const TABS = ['growth', 'money', 'happiness'] as const;
type Tab = (typeof TABS)[number];
let lastTab: Tab = 'growth';
let lastZone = 'res';

/** Подготовка параметров текста: id → названия, суммы → форматированные. */
function prepare(game: Game, i: Issue): Record<string, string | number> {
  const p: Record<string, string | number> = { ...(i.params ?? {}) };
  if (typeof p.zone === 'string') p.zone = t(`zone.${p.zone}.name`);
  if (typeof p.group === 'string') p.group = t(`funding.${p.group}`);
  if (typeof p.name === 'string') p.name = t(`diag.expense.${p.name}`);
  const money = ['income', 'expense', 'debt', 'cost', 'fares'];
  if (['broke', 'deficit', 'topExpense', 'surplus', 'interest'].includes(i.key)) money.push('n');
  for (const k of money) if (typeof p[k] === 'number') p[k] = fmtMoney(p[k] as number);
  if (i.key === 'topServices' && typeof p.list === 'string') {
    p.list = p.list
      .split(';')
      .map((s) => {
        const [id, n, cost] = s.split('|');
        return `${game.services.get(id) ? t(`service.${id}.name`) : id} ×${n} (${fmtMoney(Number(cost))})`;
      })
      .join(', ');
  }
  return p;
}

function card(game: Game, i: Issue, onFocus: (x: number, z: number) => void): HTMLElement {
  const title = t(`diag.${i.key}`, prepare(game, i));
  const fixKey = `diag.${i.key}.fix`;
  const fix = t(fixKey, prepare(game, i));
  return h(
    'div',
    { class: `diag-card ${i.sev}` },
    h('span', { class: 'diag-ic', text: i.icon }),
    h('div', { class: 'diag-t' }, h('b', { text: title }), fix && fix !== fixKey ? h('span', { class: 'dim', text: `→ ${fix}` }) : null),
    i.focus ? h('button', { class: 'btn sm', text: '👁', title: t('diag.show'), onclick: () => onFocus(i.focus!.x, i.focus!.z) }) : null,
  );
}

/** Окно «Диагностика»: почему не строится, почему минус по деньгам, что портит настроение. */
export function diagnosticsBody(game: Game, onFocus: (x: number, z: number) => void, open: { budget(): void; stats(): void }): { el: HTMLElement; tick(): void } {
  const tabs = h('div', { class: 'tabs' });
  const sub = h('div', { class: 'chips' });
  const list = h('div', { class: 'diag-list' });
  const el = h('div', { class: 'diag' }, tabs, sub, list);
  const diag = game.get('diag');

  /** Вкладки и выбор зоны перерисовываются только при смене вкладки, чтобы клики не терялись. */
  function render(): void {
    tabs.replaceChildren(...TABS.map((id) => h('button', { class: `tab${id === lastTab ? ' active' : ''}`, text: t(`diag.tab.${id}`), onclick: () => { lastTab = id; render(); } })));
    sub.replaceChildren();
    if (lastTab === 'growth') {
      for (const z of game.zoneTypes.all()) sub.append(h('button', { class: `btn sm${lastZone === z.id ? ' active' : ''}`, text: `${z.icon} ${t(`zone.${z.id}.name`)}`, onclick: () => { lastZone = z.id; render(); } }));
      if (!game.zoneTypes.get(lastZone)) lastZone = game.zoneTypes.all()[0].id;
    } else if (lastTab === 'money') {
      sub.append(h('button', { class: 'btn sm', text: `💰 ${t('hud.budget')}`, onclick: open.budget }), h('button', { class: 'btn sm', text: `📊 ${t('hud.stats')}`, onclick: open.stats }));
    }
    tick();
  }

  /** Обновляет только список проблем (вызывается по таймеру окна). */
  function tick(): void {
    let issues: Issue[];
    let intro: string;
    if (lastTab === 'growth') {
      issues = diag.growth(lastZone);
      intro = t('diag.intro.growth');
    } else if (lastTab === 'money') {
      issues = diag.money();
      intro = t('diag.intro.money');
    } else {
      issues = diag.happiness();
      intro = t('diag.intro.happiness');
    }
    list.replaceChildren(h('div', { class: 'dim small', text: intro }), ...(issues.length ? issues.map((i) => card(game, i, onFocus)) : [h('div', { class: 'diag-card good' }, h('span', { class: 'diag-ic', text: '✅' }), h('div', { class: 'diag-t' }, h('b', { text: t('diag.allGood') })))]));
  }
  render();
  return { el, tick };
}
