import type { Game } from '../core/Game';
import type { Building } from '../core/types';
import type { AudioEngine, AudioChannel } from '../audio/AudioEngine';
import { FUNDING_GROUPS } from '../data/services';
import { fmtMoney, fmtNumber, fmtPercent, fmtSigned, getLocale, LOCALES, t, type Locale } from '../i18n';
import type { Renderer } from '../render/Renderer';
import { h } from './dom';

function bar(v: number, good = true): HTMLElement {
  const hue = good ? v * 120 : (1 - v) * 120;
  return h('div', { class: 'meter' }, h('div', { class: 'meter-fill', style: `width:${Math.round(Math.min(1, Math.max(0, v)) * 100)}%;background:hsl(${hue},65%,50%)` }));
}

/** Панель информации о выбранном здании. */
export class Inspector {
  readonly el = h('div', { class: 'panel inspector', style: 'display:none' });
  private _b: Building | null = null;
  private _timer: number;
  private _offs: (() => void)[] = [];

  constructor(private _game: Game) {
    this._offs.push(
      _game.bus.on('select', (b) => {
        this._b = b;
        this.render();
      }),
      _game.bus.on('building:removed', (b) => {
        if (this._b?.id === b.id) {
          this._b = null;
          this.render();
        }
      }),
    );
    this._timer = window.setInterval(() => this._b && this.render(), 600);
    this.render();
  }

  dispose(): void {
    clearInterval(this._timer);
    for (const f of this._offs) f();
  }

  render(): void {
    const b = this._b;
    this.el.style.display = b ? 'block' : 'none';
    if (!b) return;
    const g = this._game;
    const maps = g.get('maps');
    const rows: HTMLElement[] = [];
    const row = (k: string, v: string | HTMLElement): void => {
      rows.push(h('div', { class: 'row' }, h('span', { class: 'k', text: k }), typeof v === 'string' ? h('span', { class: 'v', text: v }) : v));
    };
    let title: string;
    let icon: string;
    if (b.kind === 'zone') {
      const z = g.zoneTypes.require(b.zone);
      title = `${t(`zone.${z.id}.name`)} · ${t('inspector.level', { n: b.level })}`;
      icon = z.icon;
      if (z.housing) row(t('inspector.residents'), `${fmtNumber(b.pop)} / ${fmtNumber(b.cap)}`);
      else row(t('inspector.workers'), `${fmtNumber(b.workers)} / ${fmtNumber(b.jobs)}`);
      if (z.id === 'com') row(t('inspector.goods'), fmtPercent(b.goods));
      row(t('inspector.happiness'), bar(b.happiness));
      row(t('inspector.landValue'), bar(maps.sample('landValue', b.x, b.z)));
      row(t('inspector.pollution'), bar(maps.sample('pollution', b.x, b.z), false));
    } else {
      const d = g.services.require(b.defId);
      title = t(`service.${d.id}.name`);
      icon = d.icon;
      row(t('inspector.upkeep'), `${fmtMoney(d.upkeep * (g.get('economy').funding[d.fundingGroup] ?? 1))}${t('unit.perMonth')}`);
      if (d.jobs) row(t('inspector.staff'), fmtNumber(d.jobs));
      if (d.provides?.power) row(t('inspector.power'), `+${fmtNumber(d.provides.power)}`);
      if (d.provides?.water) row(t('inspector.water'), `+${fmtNumber(d.provides.water)}`);
      if (d.coverage) row(t('inspector.radius'), `${d.coverage.radius} ${t('unit.cells')}`);
    }
    row(t('inspector.road'), b.access ? '✅' : `❌ ${t('inspector.noRoad')}`);
    if (b.powerNeed > 0) row(`${t('inspector.electricity')} (${fmtNumber(b.powerNeed)})`, b.powered ? '✅' : `❌ ${t('inspector.none')}`);
    if (b.waterNeed > 0) row(`${t('inspector.waterSupply')} (${fmtNumber(b.waterNeed)})`, b.watered ? '✅' : `❌ ${t('inspector.none')}`);
    if (b.abandoned) row(t('inspector.state'), `🏚️ ${t('inspector.abandoned')}`);
    if (b.fire > 0) row(t('inspector.state'), `🔥 ${t('inspector.fire')}`);
    this.el.replaceChildren(
      h('div', { class: 'panel-head' }, h('span', { text: `${icon} ${title}` }), h('button', { class: 'btn icon sm', text: '✕', onclick: () => g.bus.emit('select', null) })),
      ...rows,
      h('button', { class: 'btn danger', text: t('inspector.demolish'), onclick: () => { g.builder.removeBuilding(b); g.sfx('bulldoze'); g.bus.emit('select', null); } }),
    );
  }
}

/** Модальное окно с заголовком. */
export class Modal {
  readonly el = h('div', { class: 'modal', style: 'display:none' });
  private _timer = 0;

  open(title: string, body: HTMLElement, tick?: () => void): void {
    this.close();
    this.el.replaceChildren(h('div', { class: 'modal-box' }, h('div', { class: 'panel-head' }, h('span', { text: title }), h('button', { class: 'btn icon sm', text: '✕', onclick: () => this.close() })), body));
    this.el.style.display = 'flex';
    this.el.onclick = (e) => {
      if (e.target === this.el) this.close();
    };
    if (tick) this._timer = window.setInterval(tick, 500);
  }

  close(): void {
    this.el.style.display = 'none';
    clearInterval(this._timer);
  }

  get isOpen(): boolean {
    return this.el.style.display !== 'none';
  }
}

const slider = (label: string, min: number, max: number, val: number, unit: string, on: (v: number) => void, after?: () => void): HTMLElement => {
  const out = h('span', { class: 'sv', text: `${val}${unit}` });
  const input = h('input', {
    type: 'range',
    min: String(min),
    max: String(max),
    value: String(val),
    oninput: () => {
      on(+input.value);
      out.textContent = `${input.value}${unit}`;
      after?.();
    },
  });
  return h('label', { class: 'slider' }, h('span', { class: 'sl', text: label }), input, out);
};

export function budgetBody(game: Game): { el: HTMLElement; tick(): void } {
  const eco = game.get('economy');
  const c = game.config.economy;
  const table = h('div', { class: 'table' });
  const sliders = h('div', { class: 'sliders' });
  const loan = h('div', { class: 'loan' });
  sliders.append(h('h4', { text: t('budget.taxes') }));
  for (const z of game.zoneTypes.all()) sliders.append(slider(`${z.icon} ${t(`zone.${z.id}.name`)}`, 0, c.maxTax, eco.taxes[z.id] ?? c.defaultTax, '%', (v) => eco.setTax(z.id, v), () => tick()));
  sliders.append(h('h4', { text: t('budget.funding') }));
  for (const id of FUNDING_GROUPS) sliders.append(slider(t(`funding.${id}`), 0, c.maxFunding * 100, Math.round((eco.funding[id] ?? 1) * 100), '%', (v) => eco.setFunding(id, v / 100), () => tick()));

  const line = (k: string, v: number, cls = ''): HTMLElement => h('div', { class: `trow ${cls}` }, h('span', { text: k }), h('span', { text: fmtSigned(v) }));
  function tick(): void {
    const b = eco.computeBudget();
    table.replaceChildren(
      h('h4', { text: t('budget.forecast') }),
      line(t('budget.taxRes'), b.income.res),
      line(t('budget.taxCom'), b.income.com),
      line(t('budget.taxInd'), b.income.ind),
      line(t('budget.fares'), b.income.transit),
      line(t('budget.roads'), -b.expense.roads),
      line(t('budget.services'), -b.expense.services),
      line(t('budget.transit'), -b.expense.transit),
      line(t('budget.interest'), -b.expense.interest),
      line(t('budget.total'), b.net, b.net < 0 ? 'neg total' : 'pos total'),
    );
    loan.replaceChildren(
      h('div', { text: t('budget.cash', { cash: fmtMoney(eco.money), debt: fmtMoney(eco.debt) }) }),
      h('div', { class: 'row-btns' }, h('button', { class: 'btn', text: t('budget.takeLoan', { n: fmtNumber(c.loanStep) }), onclick: () => { eco.takeLoan(); tick(); } }), h('button', { class: 'btn', text: t('budget.repay', { n: fmtNumber(c.loanStep) }), onclick: () => { eco.repayLoan(); tick(); } })),
    );
  }
  tick();
  return { el: h('div', { class: 'budget' }, h('div', { class: 'cols' }, sliders, h('div', {}, table, loan))), tick };
}

export function statsBody(game: Game): { el: HTMLElement; tick(): void } {
  const st = game.get('stats');
  const eco = game.get('economy');
  const info = h('div', { class: 'table' });
  const canvas = h('canvas', { class: 'chart' });
  canvas.width = 520;
  canvas.height = 190;
  const el = h('div', { class: 'cols' }, info, h('div', {}, h('h4', { text: t('stats.chart') }), canvas));
  const kv = (k: string, v: string): HTMLElement => h('div', { class: 'trow' }, h('span', { text: k }), h('span', { text: v }));
  function tick(): void {
    const tr = game.get('transit');
    info.replaceChildren(
      kv(t('stats.population'), fmtNumber(st.population)),
      kv(t('stats.workforce'), fmtNumber(st.workforce)),
      kv(t('stats.jobs'), t('stats.jobsDetail', { total: fmtNumber(st.jobsTotal), com: fmtNumber(st.jobsCom), ind: fmtNumber(st.jobsInd), other: fmtNumber(st.jobsOther) })),
      kv(t('stats.unemployment'), fmtPercent(st.unemployment)),
      kv(t('stats.happiness'), fmtPercent(st.happiness)),
      kv(t('stats.education'), fmtPercent(st.education)),
      kv(t('stats.crime'), fmtPercent(st.crime)),
      kv(t('stats.pollution'), fmtPercent(st.pollution)),
      kv(t('stats.traffic'), fmtPercent(st.trafficFlow)),
      kv(t('stats.vehicles'), fmtNumber(game.get('traffic').vehicles.length)),
      kv(t('stats.transit'), `${tr.stops.length} / ${tr.buses.length}`),
      kv(t('stats.riders'), fmtNumber(tr.ridersMonth)),
      kv(t('stats.buildings'), `${fmtNumber(st.buildings)} (${fmtNumber(st.abandoned)})`),
    );
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    const draw = (data: number[], color: string, zero: boolean): void => {
      if (data.length < 2) return;
      const min = Math.min(0, ...data);
      const max = Math.max(1, ...data);
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.beginPath();
      data.forEach((v, i) => {
        const x = 8 + (i / (data.length - 1)) * (canvas.width - 16);
        const y = canvas.height - 10 - ((v - min) / (max - min)) * (canvas.height - 20);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.stroke();
      if (zero && min < 0) {
        const y = canvas.height - 10 - ((0 - min) / (max - min)) * (canvas.height - 20);
        g.strokeStyle = 'rgba(255,255,255,0.25)';
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(canvas.width, y);
        g.stroke();
      }
    };
    draw(eco.history.pop, '#58a6ff', false);
    draw(eco.history.net, '#4cd964', true);
  }
  tick();
  return { el, tick };
}

export function helpBody(): HTMLElement {
  return h('div', { class: 'help', html: t('help.html') });
}

export interface SettingsDeps {
  game: Game;
  renderer: Renderer;
  audio: AudioEngine;
  onLocale?: (l: Locale) => void;
}

/** Окно настроек: язык, графика, геймплей, громкость. */
export function settingsBody(d: SettingsDeps): HTMLElement {
  const toggle = (label: string, get: () => boolean, set: (v: boolean) => void): HTMLElement => {
    const b = h('button', { class: 'btn wide' });
    const upd = (): void => {
      b.textContent = `${label}: ${get() ? t('settings.on') : t('settings.off')}`;
    };
    b.addEventListener('click', () => {
      set(!get());
      upd();
    });
    upd();
    return b;
  };
  const lang = h('select', { class: 'select', onchange: (e) => d.onLocale?.((e.target as HTMLSelectElement).value as Locale) });
  for (const l of LOCALES) lang.append(h('option', { value: l.id, text: l.label, ...(getLocale() === l.id ? { selected: 'selected' } : {}) }));
  lang.value = getLocale();
  const vol = (ch: AudioChannel): HTMLElement => slider(t(`settings.vol.${ch}`), 0, 100, Math.round(d.audio.volume(ch) * 100), '%', (v) => d.audio.setVolume(ch, v / 100));
  return h(
    'div',
    { class: 'menu settings' },
    h('label', { class: 'slider' }, h('span', { class: 'sl', text: t('settings.language') }), lang, h('span')),
    h('h4', { text: t('settings.audio') }),
    vol('master'),
    vol('ambient'),
    vol('sfx'),
    vol('music'),
    h('h4', { text: t('settings.graphics') }),
    toggle(t('settings.shadows'), () => d.renderer.shadows, (v) => d.renderer.setShadows(v)),
    toggle(t('settings.dayNight'), () => d.renderer.dayNight, (v) => (d.renderer.dayNight = v)),
    h('h4', { text: t('settings.gameplay') }),
    toggle(t('settings.fires'), () => d.game.get('disaster').enabled, (v) => (d.game.get('disaster').enabled = v)),
  );
}
