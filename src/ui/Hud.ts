import type { Game } from '../core/Game';
import { fmtMoney, fmtNumber, fmtPercent, fmtSigned, t } from '../i18n';
import { h } from './dom';
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
  private _speedBtns: HTMLElement[] = [];
  private _timer = 0;
  private _off: () => void;

  constructor(private _game: Game, actions: { menu(): void; budget(): void; stats(): void; education(): void; diagnostics(): void; maps(btn: HTMLElement): void; routes(): void; city(): void; walk(): void; settings(): void; help(): void; save(): void; goals(): void; policies(): void; advisor(btn: HTMLElement): void; event(): void }) {
    const bars = h('div', { class: 'rci', title: t('hud.demand') });
    for (const z of _game.zoneTypes.all()) {
      const fill = h('div', { class: 'rci-fill', style: `background:#${z.color.toString(16).padStart(6, '0')}` });
      this._bars.set(z.id, fill);
      bars.append(h('div', { class: 'rci-bar', title: t(`zone.${z.id}.name`) }, h('div', { class: 'rci-mid' }), fill, h('span', { class: 'rci-l', text: t(`zone.${z.id}.short`) })));
    }
    const speeds = h('div', { class: 'speeds' });
    const icons = ['⏸', '▶', '⏩', '⏭'];
    _game.config.time.speeds.forEach((v, i) => {
      const b = h('button', { class: 'btn icon', text: icons[i] ?? `×${v}`, title: t(v === 0 ? 'hud.pause' : 'hud.speed', { n: v }), onclick: () => _game.setSpeed(v) });
      this._speedBtns.push(b);
      speeds.append(b);
    });
    this._evBtn = h('button', { class: 'btn icon pulse', text: '📨', title: t('hud.event'), style: 'display:none', onclick: actions.event });
    const advBtn = h('button', { class: 'btn icon relative', title: t('hud.advisor'), onclick: () => actions.advisor(advBtn) }, h('span', { text: '🔔' }), this._badge);
    const mapsBtn = h('button', { class: 'btn', text: `🗺️ ${t('hud.maps')}`, title: t('hud.mapsTitle'), onclick: () => actions.maps(mapsBtn) });
    this.el = h(
      'div',
      { class: 'hud' },
      h('div', { class: 'hud-group' }, h('button', { class: 'btn icon', text: '☰', title: t('hud.menu'), onclick: actions.menu }), this._date),
      h('div', { class: 'hud-group clickable', title: t('hud.budget'), onclick: actions.budget }, this._money, this._delta),
      h('div', { class: 'hud-group clickable', title: t('hud.stats'), onclick: actions.stats }, h('span', { text: '👥' }), this._pop, h('span', { text: '💼' }), this._jobs, h('span', { text: '😊' }), this._hap, h('span', { text: '🚗' }), this._traf),
      h('div', { class: 'hud-group clickable', title: t('hud.goals'), onclick: actions.goals }, this._level, h('div', { class: 'lv-bar' }, this._lvFill)),
      h('div', { class: 'hud-group', title: t('hud.utilities') }, h('span', { text: '⚡' }), this._power, h('span', { text: '💧' }), this._water),
      bars,
      h('div', { class: 'hud-spacer' }),
      mapsBtn,
      h('div', { class: 'hud-group buttons' },
        this._evBtn,
        advBtn,
        h('button', { class: 'btn icon', text: '🎯', title: `${t('hud.goals')} (J)`, onclick: actions.goals }),
        h('button', { class: 'btn icon', text: '📜', title: `${t('hud.policies')} (K)`, onclick: actions.policies }),
        h('button', { class: 'btn icon', text: '💰', title: `${t('hud.budget')} (B)`, onclick: actions.budget }),
        h('button', { class: 'btn icon', text: '📊', title: `${t('hud.stats')} (G)`, onclick: actions.stats }),
        h('button', { class: 'btn icon', text: '🔍', title: `${t('hud.diagnostics')} (N) — ${t('hud.diagnosticsHint')}`, onclick: actions.diagnostics }),
        h('button', { class: 'btn icon', text: '🎓', title: `${t('hud.education')} (E)`, onclick: actions.education }),
        h('button', { class: 'btn icon', text: '🚌', title: `${t('hud.routes')} (T)`, onclick: actions.routes }),
        h('button', { class: 'btn icon', text: '🗑️', title: `${t('hud.city')} (H)`, onclick: actions.city }),
        h('button', { class: 'btn icon', text: '🚶', title: `${t('hud.walk')} (P)`, onclick: actions.walk }),
        h('button', { class: 'btn icon', text: '💾', title: t('menu.save'), onclick: actions.save }),
        h('button', { class: 'btn icon', text: '⚙️', title: t('menu.settings'), onclick: actions.settings }),
        h('button', { class: 'btn icon', text: '❓', title: t('menu.help'), onclick: actions.help }),
      ),
      speeds,
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
  }

  private _refreshSpeed(): void {
    this._game.config.time.speeds.forEach((v, i) => this._speedBtns[i].classList.toggle('active', v === this._game.speed));
  }

  refresh(): void {
    const g = this._game;
    const st = g.get('stats');
    const eco = g.get('economy');
    const u = g.get('utility');
    this._date.textContent = dateLabel(g.get('time'));
    const pr = g.get('progress');
    this._level.textContent = `🏙️ ${t(`level.${pr.levels[pr.level].id}`)}`;
    this._lvFill.style.width = `${Math.round(pr.progressToNext() * 100)}%`;
    const issues = g.get('advisor').issues.filter((i) => i.sev !== 'info').length;
    this._badge.textContent = String(issues);
    this._badge.style.display = issues ? 'block' : 'none';
    this._evBtn.style.display = g.get('events').pending ? 'inline-block' : 'none';
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
  private _timer: number;

  constructor(private _game: Game) {
    this.el = h('div', { class: 'clock', title: t('hud.clock') }, this._icon, h('div', { class: 'clock-c' }, this._time, this._date));
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
  }
}
