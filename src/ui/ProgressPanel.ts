import type { Game } from '../core/Game';
import type { CityEventOption } from '../data/events';
import { fmtMoney, fmtNumber, t } from '../i18n';
import { h } from './dom';

const clean = (a: (Node | null)[]): Node[] => a.filter((x): x is Node => !!x);

const bar = (v: number): HTMLElement => h('div', { class: 'meter' }, h('div', { class: 'meter-fill', style: `width:${Math.round(Math.min(1, Math.max(0, v)) * 100)}%;background:hsl(${Math.round(v * 120)},65%,50%)` }));

/** Описание эффекта вида «Преступность ×1.30». */
function fxChips(o: { mul?: Record<string, number>; add?: Record<string, number> }): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const [k, v] of Object.entries(o.mul ?? {})) {
    const good = ['income', 'transitShare'].includes(k) ? v >= 1 : v <= 1;
    out.push(h('span', { class: `chip-fx ${good ? 'good' : 'bad'}`, text: `${t(`fx.${k}`)} ×${(Math.round(v * 100) / 100).toString()}` }));
  }
  for (const [k, v] of Object.entries(o.add ?? {})) {
    const pct = k === 'happiness' || k.startsWith('demand');
    out.push(h('span', { class: `chip-fx ${v >= 0 ? 'good' : 'bad'}`, text: `${t(`fx.${k}`)} ${v >= 0 ? '+' : '−'}${pct ? `${Math.round(Math.abs(v) * 100)}%` : Math.abs(v)}` }));
  }
  return out;
}

/** Окно целей: уровень города, награды за уровни, активные цели и действующие эффекты. */
export function goalsBody(game: Game): { el: HTMLElement; tick(): void } {
  const root = h('div', { class: 'goals' });
  function tick(): void {
    const pr = game.get('progress');
    const ob = game.get('objectives');
    const lv = pr.levels[pr.level];
    const next = pr.levels[pr.level + 1];
    root.replaceChildren(
      ...clean([
      h('div', { class: 'lv-head' },
        h('b', { text: `🏙️ ${t(`level.${lv.id}`)}` }),
        h('span', { class: 'dim', text: next ? t('goals.next', { name: t(`level.${next.id}`), pop: fmtNumber(next.pop), have: fmtNumber(pr.peakPop) }) : t('goals.max') }),
      ),
      bar(pr.progressToNext()),
      pr.enabled ? null : h('p', { class: 'dim', text: t('goals.sandbox') }),
      h('h4', { text: `🎯 ${t('goals.active')}` }),
      ...ob.active.map((o) => {
        const d = ob.describe(o);
        return h('div', { class: 'goal' },
          h('div', { class: 'goal-t' }, h('span', { text: d.text }), h('span', { class: 'dim', text: `${d.value} / ${d.target}` })),
          bar(ob.fraction(o)),
          h('div', { class: 'goal-b' }, h('span', { class: 'reward', text: `🎁 ${fmtMoney(o.reward)}` }), h('button', { class: 'btn sm', text: `🔄 ${t('goals.reroll')}`, onclick: () => { ob.reroll(o.id); tick(); } })),
        );
      }),
      h('p', { class: 'dim', text: t('goals.done', { n: ob.completed }) }),
      h('h4', { text: `📶 ${t('goals.levels')}` }),
      ...pr.levels.map((l, i) => {
        const names = pr.unlocksAt(i > 0 ? pr.levels[i - 1].pop : -1, l.pop).map((k) => (k.startsWith('policy:') ? t(`policy.${k.slice(7)}.name`) : pr.nameOf(k)));
        return h('div', { class: `lvl${i <= pr.level ? ' reached' : ''}` },
          h('span', { text: `${i <= pr.level ? '✅' : '🔒'} ${t(`level.${l.id}`)}` }),
          h('span', { class: 'dim', text: `${fmtNumber(l.pop)} ${t('unit.people')}${l.reward ? ` · 🎁 ${fmtMoney(l.reward)}` : ''}` }),
          names.length ? h('span', { class: 'dim small', text: names.join(', ') }) : null,
        );
      }),
      game.get('mods').active.filter((m) => !m.id.startsWith('policy:')).length ? h('h4', { text: `✨ ${t('goals.effects')}` }) : null,
      ...game.get('mods').active.filter((m) => !m.id.startsWith('policy:')).map((m) =>
        h('div', { class: 'eff' }, h('span', { text: `${m.icon} ${t(m.nameKey)}` }), h('span', { class: 'dim', text: `${game.get('mods').daysLeft(m) ?? '∞'} ${t('unit.days')}` }), h('div', { class: 'fx' }, ...fxChips(m))),
      ),
      ]),
    );
  }
  tick();
  return { el: root, tick };
}

/** Окно политик: переключатели с платой и описанием эффекта. */
export function policiesBody(game: Game): { el: HTMLElement; tick(): void } {
  const root = h('div', { class: 'policies' });
  function tick(): void {
    const ps = game.get('policy');
    root.replaceChildren(
      h('p', { class: 'dim', text: t('policies.hint', { n: fmtMoney(ps.upkeep()) }) }),
      ...game.policies.all().map((p) => {
        const on = ps.has(p.id);
        const open = ps.unlocked(p.id);
        return h('div', { class: `policy${on ? ' on' : ''}${open ? '' : ' locked'}` },
          h('span', { class: 'p-ic', text: p.icon }),
          h('div', { class: 'p-t' },
            h('b', { text: t(`policy.${p.id}.name`) }),
            h('span', { class: 'dim', text: t(`policy.${p.id}.desc`) }),
            h('div', { class: 'fx' }, ...fxChips(p)),
          ),
          open
            ? h('button', { class: `btn sm${on ? ' active' : ''}`, text: on ? `${t('settings.on')} · ${fmtMoney(p.upkeep)}${t('unit.perMonth')}` : `${t('settings.off')} · ${fmtMoney(p.upkeep)}${t('unit.perMonth')}`, onclick: () => { const r = ps.toggle(p.id); if (r.reasonKey) game.message(r.reasonKey, undefined, 'bad'); tick(); } })
            : h('span', { class: 'dim', text: `🔒 ${fmtNumber(p.unlock)} ${t('unit.people')}` }),
        );
      }),
    );
  }
  tick();
  return { el: root, tick };
}

/** Окно события города: описание и варианты решения. */
export function eventBody(game: Game, close: () => void): HTMLElement {
  const ev = game.get('events');
  const p = ev.pending;
  const d = p && ev.def(p.id);
  if (!p || !d) return h('div', { text: t('events.none') });
  const money = game.get('economy').money;
  return h('div', { class: 'event' },
    h('div', { class: 'ev-head' }, h('span', { class: 'ev-ic', text: d.icon }), h('p', { text: t(`event.${d.id}.desc`) })),
    ...d.options.map((o: CityEventOption, i) => {
      const cost = ev.costOf(o);
      const gain = ev.gainOf(o);
      const poor = cost > money;
      return h('button', {
        class: `ev-opt btn${poor ? ' poor' : ''}${i === d.options.length - 1 ? ' dflt' : ''}`,
        onclick: () => {
          if (ev.choose(o.id)) close();
        },
      },
        h('b', { text: t(`event.${d.id}.opt.${o.id}`) }),
        h('span', { class: 'dim', text: [cost ? `−${fmtMoney(cost)}` : '', gain ? `+${fmtMoney(gain)}` : '', o.days ? `${o.days} ${t('unit.days')}` : ''].filter(Boolean).join(' · ') }),
        h('div', { class: 'fx' }, ...fxChips(o)),
      );
    }),
    h('p', { class: 'dim small', text: t('events.expire', { n: game.config.events.expireDays }) }),
  );
}

/** Выпадающий список советника: проблемы города с переходом к месту на карте. */
export function advisorList(game: Game, focus: (x: number, z: number) => void, closeMenu: () => void): HTMLElement[] {
  const issues = game.get('advisor').issues;
  if (!issues.length) return [h('div', { class: 'adv-ok', text: `✅ ${t('advisor.ok')}` })];
  return issues.map((i) =>
    h('button', {
      class: `btn wide adv ${i.sev}`,
      title: i.x !== undefined ? t('advisor.go') : '',
      onclick: () => {
        if (i.x !== undefined && i.z !== undefined) focus(i.x, i.z);
        closeMenu();
      },
    }, h('span', { text: `${i.icon} ${t(i.key, i.params)}` }), i.x !== undefined ? h('span', { class: 'dim', text: '📍' }) : null),
  );
}

