import type { Game } from '../core/Game';
import { h, money, fmt, signed } from './dom';

const SPEEDS: [number, string, string][] = [
  [0, '⏸', 'Пауза (Пробел)'],
  [1, '▶', 'Скорость ×1 (1)'],
  [2, '⏩', 'Скорость ×2 (2)'],
  [4, '⏭', 'Скорость ×4 (3)'],
];

/** Верхняя панель: дата, деньги, население, счастье, спрос RCI, скорость, меню. */
export class Hud {
  readonly el: HTMLElement;
  private _date = h('span', { class: 'hud-date' });
  private _money = h('span', { class: 'hud-money' });
  private _delta = h('span', { class: 'hud-delta' });
  private _pop = h('span', { class: 'hud-val' });
  private _jobs = h('span', { class: 'hud-val' });
  private _hap = h('span', { class: 'hud-val' });
  private _traf = h('span', { class: 'hud-val' });
  private _power = h('span', { class: 'hud-val' });
  private _water = h('span', { class: 'hud-val' });
  private _bars = new Map<string, HTMLElement>();
  private _speedBtns: HTMLElement[] = [];

  constructor(private _game: Game, actions: { menu(): void; budget(): void; stats(): void; maps(btn: HTMLElement): void }) {
    const bars = h('div', { class: 'rci', title: 'Спрос: жилой / коммерческий / промышленный' });
    for (const z of _game.zoneTypes.all()) {
      const fill = h('div', { class: 'rci-fill', style: `background:#${z.color.toString(16).padStart(6, '0')}` });
      this._bars.set(z.id, fill);
      bars.append(h('div', { class: 'rci-bar', title: z.name }, h('div', { class: 'rci-mid' }), fill, h('span', { class: 'rci-l', text: z.name[0] })));
    }
    const speeds = h('div', { class: 'speeds' });
    for (const [v, label, title] of SPEEDS) {
      const b = h('button', { class: 'btn icon', text: label, title, onclick: () => _game.setSpeed(v) });
      this._speedBtns.push(b);
      speeds.append(b);
    }
    const mapsBtn = h('button', { class: 'btn', text: '🗺️ Карты', title: 'Тепловые карты', onclick: () => actions.maps(mapsBtn) });
    this.el = h(
      'div',
      { class: 'hud' },
      h('div', { class: 'hud-group' }, h('button', { class: 'btn icon', text: '☰', title: 'Меню', onclick: actions.menu }), this._date),
      h('div', { class: 'hud-group clickable', title: 'Бюджет', onclick: actions.budget }, this._money, this._delta),
      h('div', { class: 'hud-group clickable', title: 'Статистика', onclick: actions.stats }, h('span', { text: '👥' }), this._pop, h('span', { text: '💼' }), this._jobs, h('span', { text: '😊' }), this._hap, h('span', { text: '🚗' }), this._traf),
      h('div', { class: 'hud-group', title: 'Электричество / вода: производство ⁄ потребление' }, h('span', { text: '⚡' }), this._power, h('span', { text: '💧' }), this._water),
      bars,
      h('div', { class: 'hud-spacer' }),
      mapsBtn,
      speeds,
    );
    _game.bus.on('speed:changed', () => this._refreshSpeed());
    this._refreshSpeed();
    setInterval(() => this.refresh(), 250);
    this.refresh();
  }

  private _refreshSpeed(): void {
    SPEEDS.forEach(([v], i) => this._speedBtns[i].classList.toggle('active', v === this._game.speed));
  }

  refresh(): void {
    const g = this._game;
    const st = g.get('stats');
    const eco = g.get('economy');
    const u = g.get('utility');
    this._date.textContent = g.get('time').label;
    this._money.textContent = money(eco.money);
    this._money.classList.toggle('neg', eco.money < 0);
    const net = (eco.last ?? eco.computeBudget()).net;
    this._delta.textContent = `${signed(net)}/мес`;
    this._delta.classList.toggle('neg', net < 0);
    this._pop.textContent = fmt(st.population);
    this._jobs.textContent = st.workforce > 5 ? `${fmt(st.jobsTotal)} (−${Math.round(st.unemployment * 100)}%)` : fmt(st.jobsTotal);
    this._hap.textContent = `${Math.round(st.happiness * 100)}%`;
    this._traf.textContent = `${Math.round(st.trafficFlow * 100)}%`;
    this._power.textContent = `${fmt(u.powerSupply)}/${fmt(u.powerDemand)}`;
    this._power.classList.toggle('neg', u.powerSupply < u.powerDemand);
    this._water.textContent = `${fmt(u.waterSupply)}/${fmt(u.waterDemand)}`;
    this._water.classList.toggle('neg', u.waterSupply < u.waterDemand);
    for (const [id, fill] of this._bars) {
      const v = g.get('demand').values[id] ?? 0;
      fill.style.height = `${Math.abs(v) * 50}%`;
      fill.style.top = v >= 0 ? `${50 - v * 50}%` : '50%';
      fill.style.opacity = v >= 0 ? '1' : '0.45';
    }
  }
}
