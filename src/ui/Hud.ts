import type { Game } from '../core/Game';
import { fmtMoney, fmtNumber, fmtPercent, fmtSigned, t } from '../i18n';
import { h } from './dom';
import { icon } from './icons';
import { UI_ICONS } from './icons/map';
import { weatherLabel } from './RegionPanels';
import { clockLabel, dateLabel, phaseIcon } from './format';

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
  private _level = h('span', { class: 'hud-level' });
  private _lvFill = h('div', { class: 'lv-fill' });
  private _badge = h('span', { class: 'badge', style: 'display:none' });
  private _evBtn: HTMLElement;
  private _evSide!: HTMLElement;
  private _side!: HTMLElement;
  private _speedOne!: HTMLElement;
  private _speedBtns: HTMLElement[] = [];
  private _timer = 0;
  private _off: () => void;

  constructor(private _game: Game, actions: { menu(): void; budget(): void; stats(): void; education(): void; diagnostics(): void; maps(btn: HTMLElement): void; routes(): void; city(): void; walk(): void; settings(): void; help(): void; save(): void; goals(): void; policies(): void; advisor(btn: HTMLElement): void; event(): void; trade(): void; tourism(): void }) {
    const bars = h('div', { class: 'rci', title: t('hud.demand') });
    for (const z of _game.zoneTypes.all()) {
      const fill = h('div', { class: 'rci-fill', style: `background:#${z.color.toString(16).padStart(6, '0')}` });
      this._bars.set(z.id, fill);
      bars.append(h('div', { class: 'rci-bar', title: t(`zone.${z.id}.name`) }, h('div', { class: 'rci-mid' }), fill, h('span', { class: 'rci-l', text: t(`zone.${z.id}.short`) })));
    }
    const speeds = h('div', { class: 'speeds' });
    _game.config.time.speeds.forEach((v, i) => {
      const b = h('button', { class: 'btn icon', title: t(v === 0 ? 'hud.pause' : 'hud.speed', { n: v }), onclick: () => _game.setSpeed(v) }, icon(UI_ICONS.speeds[i], `×${v}`));
      this._speedBtns.push(b);
      speeds.append(b);
    });
    this._evBtn = h('button', { class: 'btn icon pulse', title: t('hud.event'), style: 'display:none', onclick: actions.event }, icon(UI_ICONS.event, '📨'));
    const advBtn = h('button', { class: 'btn icon relative', title: t('hud.advisor'), onclick: () => actions.advisor(advBtn) }, icon(UI_ICONS.advisor, '🔔'), this._badge);
    const mapsBtn = h('button', { class: 'btn maps-btn', title: t('hud.mapsTitle'), onclick: () => actions.maps(mapsBtn) }, icon(UI_ICONS.maps, '🗺️'), h('span', { class: 'lbl', text: ` ${t('hud.maps')}` }));
    // кнопки окон: ряд значков на ПК и тот же набор вертикальным списком в боковом меню на телефоне
    const defs: { ic: string; svg: string; label: string; title: string; fn: () => void }[] = [
      { ic: '🎯', svg: UI_ICONS.goals, label: t('hud.goals'), title: `${t('hud.goals')} (J)`, fn: actions.goals },
      { ic: '📜', svg: UI_ICONS.policies, label: t('hud.policies'), title: `${t('hud.policies')} (K)`, fn: actions.policies },
      { ic: '💰', svg: UI_ICONS.budget, label: t('hud.budget'), title: `${t('hud.budget')} (B)`, fn: actions.budget },
      { ic: '📊', svg: UI_ICONS.stats, label: t('hud.stats'), title: `${t('hud.stats')} (G)`, fn: actions.stats },
      { ic: '🔍', svg: UI_ICONS.diagnostics, label: t('hud.diagnostics'), title: `${t('hud.diagnostics')} (N) — ${t('hud.diagnosticsHint')}`, fn: actions.diagnostics },
      { ic: '🎓', svg: UI_ICONS.education, label: t('hud.education'), title: `${t('hud.education')} (E)`, fn: actions.education },
      { ic: '🚌', svg: UI_ICONS.routes, label: t('hud.routes'), title: `${t('hud.routes')} (T)`, fn: actions.routes },
      { ic: '🚛', svg: UI_ICONS.trade, label: t('hud.trade'), title: t('hud.trade'), fn: actions.trade },
      { ic: '🧳', svg: UI_ICONS.tourism, label: t('hud.tourism'), title: t('hud.tourism'), fn: actions.tourism },
      { ic: '🗑️', svg: UI_ICONS.city, label: t('hud.city'), title: `${t('hud.city')} (H)`, fn: actions.city },
      { ic: '🚶', svg: UI_ICONS.walk, label: t('hud.walk'), title: `${t('hud.walk')} (P)`, fn: actions.walk },
      { ic: '💾', svg: UI_ICONS.save, label: t('menu.save'), title: t('menu.save'), fn: actions.save },
      { ic: '❓', svg: UI_ICONS.help, label: t('menu.help'), title: t('menu.help'), fn: actions.help },
    ];
    const rowBtns = defs.map((d) => h('button', { class: 'btn icon', title: d.title, onclick: d.fn }, icon(d.svg, d.ic)));
    let moreBtn!: HTMLElement;
    const side = h('div', { class: 'side-menu' });
    this._side = side;
    const closeSide = (): void => side.classList.remove('open');
    const sideBtns = defs.map((d) => h('button', { class: 'btn side-item', onclick: () => { closeSide(); d.fn(); } }, h('span', { class: 'si-ic' }, icon(d.svg, d.ic)), h('span', { text: d.label })));
    const evSide = h('button', { class: 'btn side-item pulse', style: 'display:none', onclick: () => { closeSide(); actions.event(); } }, h('span', { class: 'si-ic' }, icon(UI_ICONS.event, '📨')), h('span', { text: t('hud.event') }));
    this._evSide = evSide;
    const advSide = h('button', { class: 'btn side-item', onclick: () => { closeSide(); actions.advisor(moreBtn); } }, h('span', { class: 'si-ic' }, icon(UI_ICONS.advisor, '🔔')), h('span', { text: t('hud.advisor') }));
    side.append(evSide, advSide, ...sideBtns);
    moreBtn = h('button', { class: 'btn icon more-btn', title: t('hud.more'), onclick: (e: Event) => { e.stopPropagation(); side.classList.toggle('open'); } }, icon(UI_ICONS.more, '⋯'));
    // нажатие мимо бокового меню закрывает его
    document.addEventListener('pointerdown', (e) => side.classList.contains('open') && !side.contains(e.target as Node) && e.target !== moreBtn && closeSide());
    // одна кнопка времени на телефоне: ⏸ → ▶ → ⏩ → ⏭
    const speedOne = h('button', { class: 'btn icon speed-one', title: t('hud.speedCycle'), onclick: () => {
      const sp = _game.config.time.speeds;
      _game.setSpeed(sp[(sp.indexOf(_game.speed) + 1) % sp.length]);
    } });
    this._speedOne = speedOne;
    this.el = h(
      'div',
      { class: 'hud' },
      h('div', { class: 'hud-group' }, h('button', { class: 'btn icon', title: t('hud.menu'), onclick: actions.menu }, icon(UI_ICONS.menu, '☰')), this._date),
      h('div', { class: 'hud-group clickable hud-money-g', title: t('hud.budget'), onclick: actions.budget }, this._money, this._delta),
      h('div', { class: 'hud-group clickable hud-stats', title: t('hud.stats'), onclick: actions.stats }, h('span', { class: 'hud-ic' }, icon(UI_ICONS.pop, '👥')), this._pop, h('span', { class: 'hud-ic' }, icon(UI_ICONS.jobs, '💼')), this._jobs, h('span', { class: 'hud-ic' }, icon(UI_ICONS.happy, '😊')), this._hap, h('span', { class: 'hud-ic' }, icon(UI_ICONS.traffic, '🚗')), this._traf),
      h('div', { class: 'hud-group clickable hud-level', title: t('hud.goals'), onclick: actions.goals }, h('span', { class: 'hud-ic' }, icon(UI_ICONS.level, '🏙️')), this._level, h('div', { class: 'lv-bar' }, this._lvFill)),
      h('div', { class: 'hud-group hud-util', title: t('hud.utilities') }, h('span', { class: 'hud-ic' }, icon(UI_ICONS.power, '⚡')), this._power, h('span', { class: 'hud-ic' }, icon(UI_ICONS.water, '💧')), this._water),
      bars,
      h('div', { class: 'hud-spacer' }),
      speedOne,
      mapsBtn,
      h('div', { class: 'hud-group buttons' }, this._evBtn, advBtn, ...rowBtns),
      moreBtn,
      speeds,
      side,
    );
    const off = _game.bus.on('speed:changed', () => this._refreshSpeed());
    this._off = off;
    this._refreshSpeed();
    this._timer = window.setInterval(() => this.refresh(), 250);
    this.refresh();
  }

  dispose(): void {
    clearInterval(this._timer);
    this._off();
    this._side.remove();
  }

  private _refreshSpeed(): void {
    const sp = this._game.config.time.speeds;
    sp.forEach((v, i) => this._speedBtns[i].classList.toggle('active', v === this._game.speed));
    const idx = sp.indexOf(this._game.speed);
    this._speedOne.replaceChildren(icon(UI_ICONS.speeds[idx], `×${this._game.speed}`));
  }

  refresh(): void {
    const g = this._game;
    const st = g.get('stats');
    const eco = g.get('economy');
    const u = g.get('utility');
    this._date.textContent = dateLabel(g.get('time'));
    const pr = g.get('progress');
    this._level.textContent = t(`level.${pr.levels[pr.level].id}`);
    this._lvFill.style.width = `${Math.round(pr.progressToNext() * 100)}%`;
    const issues = g.get('advisor').issues.filter((i) => i.sev !== 'info').length;
    this._badge.textContent = String(issues);
    this._badge.style.display = issues ? 'block' : 'none';
    this._evBtn.style.display = g.get('events').pending ? 'inline-block' : 'none';
    this._evSide.style.display = g.get('events').pending ? 'flex' : 'none';
    this._money.textContent = fmtMoney(eco.money);
    this._money.classList.toggle('neg', eco.money < 0);
    const net = (eco.last ?? eco.computeBudget()).net;
    this._delta.textContent = `${fmtSigned(net)}${t('unit.perMonth')}`;
    this._delta.classList.toggle('neg', net < 0);
    this._pop.textContent = fmtNumber(st.population);
    this._jobs.textContent = st.workforce > 5 ? `${fmtNumber(st.jobsTotal)} (−${Math.round(st.unemployment * 100)}%)` : fmtNumber(st.jobsTotal);
    this._hap.textContent = fmtPercent(st.happiness);
    this._traf.textContent = fmtPercent(st.trafficFlow);
    this._power.textContent = `${fmtNumber(u.powerSupply)}/${fmtNumber(u.powerDemand)}`;
    this._power.classList.toggle('neg', u.powerSupply < u.powerDemand);
    this._water.textContent = `${fmtNumber(u.waterSupply)}/${fmtNumber(u.waterDemand)}`;
    this._water.classList.toggle('neg', u.waterSupply < u.waterDemand);
    for (const [id, fill] of this._bars) {
      const v = g.get('demand').values[id] ?? 0;
      fill.style.height = `${Math.abs(v) * 50}%`;
      fill.style.top = v >= 0 ? `${50 - v * 50}%` : '50%';
      fill.style.opacity = v >= 0 ? '1' : '0.45';
    }
  }
}

/** Игровые часы внизу экрана: время суток (как у освещения), дата, значок фазы дня. */
export class Clock {
  readonly el: HTMLElement;
  private _icon = h('span', { class: 'clock-ic' });
  private _time = h('span', { class: 'clock-t' });
  private _date = h('span', { class: 'clock-d' });
  private _wx = h('span', { class: 'clock-w' });
  private _wxKind = '';
  private _timer: number;

  constructor(private _game: Game) {
    this.el = h('div', { class: 'clock', title: t('hud.clock') }, this._icon, h('div', { class: 'clock-c' }, this._time, this._date), this._wx);
    this._timer = window.setInterval(() => this.refresh(), 200);
    this.refresh();
  }

  dispose(): void {
    clearInterval(this._timer);
  }

  refresh(): void {
    const time = this._game.get('time');
    this._icon.textContent = phaseIcon(time.tod);
    this._time.textContent = clockLabel(time.tod);
    this._date.textContent = dateLabel(time);
    // погода: значок и температура; подробности — в подсказке
    const w = this._game.get('weather');
    if (!w) return;
    if (w.kind !== this._wxKind) {
      this._wxKind = w.kind;
      this._wx.replaceChildren(icon(UI_ICONS.weather[w.kind], w.icon()), h('b', {}));
    }
    (this._wx.lastChild as HTMLElement).textContent = `${w.temperature()}°`;
    this.el.title = `${t('hud.clock')}\n${weatherLabel(this._game)}`;
  }
}
