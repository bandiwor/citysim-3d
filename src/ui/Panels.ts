import type { Game } from '../core/Game';
import type { Building } from '../core/types';
import { LOAN_STEP } from '../sim/EconomySystem';
import { h, fmt, money, signed } from './dom';

const pct = (v: number): string => `${Math.round(v * 100)}%`;

function bar(v: number, good = true): HTMLElement {
  const hue = good ? v * 120 : (1 - v) * 120;
  return h('div', { class: 'meter' }, h('div', { class: 'meter-fill', style: `width:${Math.round(v * 100)}%;background:hsl(${hue},65%,50%)` }));
}

/** Панель информации о выбранном здании. */
export class Inspector {
  readonly el = h('div', { class: 'panel inspector', style: 'display:none' });
  private _b: Building | null = null;

  constructor(private _game: Game) {
    _game.bus.on('select', (b) => {
      this._b = b;
      this.render();
    });
    _game.bus.on('building:removed', (b) => {
      if (this._b?.id === b.id) {
        this._b = null;
        this.render();
      }
    });
    setInterval(() => this._b && this.render(), 600);
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
      title = `${z.name} · ур. ${b.level}`;
      icon = z.icon;
      if (z.housing) row('Жители', `${fmt(b.pop)} / ${fmt(b.cap)}`);
      else row('Рабочие', `${fmt(b.workers)} / ${fmt(b.jobs)}`);
      if (z.id === 'com') row('Товары', pct(b.goods));
      row('Счастье', bar(b.happiness));
      row('Стоимость земли', bar(maps.landValue[b.cell]));
      row('Загрязнение', bar(maps.pollution[b.cell], false));
    } else {
      const d = g.services.require(b.defId);
      title = d.name;
      icon = d.icon;
      row('Содержание', `₽${fmt(d.upkeep * (g.get('economy').funding[d.fundingGroup] ?? 1))}/мес`);
      if (d.jobs) row('Персонал', fmt(d.jobs));
      if (d.provides?.power) row('Энергия', `+${fmt(d.provides.power)}`);
      if (d.provides?.water) row('Вода', `+${fmt(d.provides.water)}`);
      if (d.coverage) row('Радиус', `${d.coverage.radius} кл.`);
    }
    row('Дорога', b.access >= 0 ? '✅' : '❌ нет подключения');
    if (b.powerNeed > 0) row(`Электричество (${fmt(b.powerNeed)})`, b.powered ? '✅' : '❌ нет');
    if (b.waterNeed > 0) row(`Вода (${fmt(b.waterNeed)})`, b.watered ? '✅' : '❌ нет');
    if (b.abandoned) row('Состояние', '🏚️ заброшено');
    if (b.fire > 0) row('Состояние', '🔥 пожар!');
    this.el.replaceChildren(
      h('div', { class: 'panel-head' }, h('span', { text: `${icon} ${title}` }), h('button', { class: 'btn icon sm', text: '✕', onclick: () => g.bus.emit('select', null) })),
      ...rows,
      h('button', { class: 'btn danger', text: 'Снести', onclick: () => { g.builder.removeBuilding(b); g.bus.emit('select', null); } }),
    );
  }
}

/** Модальное окно с заголовком. */
export class Modal {
  readonly el = h('div', { class: 'modal', style: 'display:none' });
  private _timer = 0;
  onTick: (() => void) | null = null;

  open(title: string, body: HTMLElement, tick?: () => void): void {
    this.close();
    this.el.replaceChildren(
      h('div', { class: 'modal-box' }, h('div', { class: 'panel-head' }, h('span', { text: title }), h('button', { class: 'btn icon sm', text: '✕', onclick: () => this.close() })), body),
    );
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

const FUNDING_NAMES: Record<string, string> = { police: '🚓 Полиция', fire: '🚒 Пожарные', health: '🏥 Здравоохранение', education: '🎓 Образование', parks: '🌳 Парки', utilities: '⚡ Коммуналка' };

export function budgetBody(game: Game): { el: HTMLElement; tick(): void } {
  const eco = game.get('economy');
  const el = h('div', { class: 'budget' });
  const table = h('div', { class: 'table' });
  const sliders = h('div', { class: 'sliders' });
  const slider = (label: string, min: number, max: number, val: number, unit: string, on: (v: number) => void): HTMLElement => {
    const out = h('span', { class: 'sv', text: `${val}${unit}` });
    const input = h('input', { type: 'range', min: String(min), max: String(max), value: String(val), oninput: () => { on(+input.value); out.textContent = `${input.value}${unit}`; tick(); } });
    return h('label', { class: 'slider' }, h('span', { class: 'sl', text: label }), input, out);
  };
  sliders.append(h('h4', { text: 'Налоги' }));
  for (const z of game.zoneTypes.all()) sliders.append(slider(`${z.icon} ${z.name}`, 0, 25, eco.taxes[z.id] ?? 9, '%', (v) => eco.setTax(z.id, v)));
  sliders.append(h('h4', { text: 'Финансирование служб' }));
  for (const [id, name] of Object.entries(FUNDING_NAMES)) sliders.append(slider(name, 0, 150, Math.round((eco.funding[id] ?? 1) * 100), '%', (v) => eco.setFunding(id, v / 100)));
  const loan = h('div', { class: 'loan' });

  const line = (k: string, v: number, cls = ''): HTMLElement => h('div', { class: `trow ${cls}` }, h('span', { text: k }), h('span', { text: signed(v) }));
  function tick(): void {
    const b = eco.computeBudget();
    table.replaceChildren(
      h('h4', { text: 'Прогноз на месяц' }),
      line('Жилые налоги', b.income.res),
      line('Коммерческие налоги', b.income.com),
      line('Промышленные налоги', b.income.ind),
      line('Билеты транспорта', b.income.transit),
      line('Дороги', -b.expense.roads),
      line('Службы', -b.expense.services),
      line('Транспорт', -b.expense.transit),
      line('Проценты по кредиту', -b.expense.interest),
      line('Итого', b.net, b.net < 0 ? 'neg total' : 'pos total'),
    );
    loan.replaceChildren(
      h('div', { text: `Касса: ${money(eco.money)}   Долг: ${money(eco.debt)}` }),
      h('div', { class: 'row-btns' }, h('button', { class: 'btn', text: `Взять кредит ${fmt(LOAN_STEP)}`, onclick: () => { eco.takeLoan(); tick(); } }), h('button', { class: 'btn', text: `Погасить ${fmt(LOAN_STEP)}`, onclick: () => { eco.repayLoan(); tick(); } })),
    );
  }
  tick();
  el.append(h('div', { class: 'cols' }, sliders, h('div', {}, table, loan)));
  return { el, tick };
}

export function statsBody(game: Game): { el: HTMLElement; tick(): void } {
  const st = game.get('stats');
  const eco = game.get('economy');
  const info = h('div', { class: 'table' });
  const canvas = h('canvas', { class: 'chart' });
  canvas.width = 520;
  canvas.height = 190;
  const el = h('div', { class: 'cols' }, info, h('div', {}, h('h4', { text: 'Население (синий) и месячный баланс (зелёный)' }), canvas));
  const kv = (k: string, v: string): HTMLElement => h('div', { class: 'trow' }, h('span', { text: k }), h('span', { text: v }));
  function tick(): void {
    const tr = game.get('transit');
    info.replaceChildren(
      kv('Население', fmt(st.population)),
      kv('Рабочая сила', fmt(st.workforce)),
      kv('Рабочие места', `${fmt(st.jobsTotal)} (Ком ${fmt(st.jobsCom)}, Пром ${fmt(st.jobsInd)}, Службы ${fmt(st.jobsOther)})`),
      kv('Безработица', pct(st.unemployment)),
      kv('Счастье', pct(st.happiness)),
      kv('Образование', pct(st.education)),
      kv('Преступность', pct(st.crime)),
      kv('Загрязнение', pct(st.pollution)),
      kv('Скорость трафика', pct(st.trafficFlow)),
      kv('Машин на дорогах', fmt(game.get('traffic').vehicles.length)),
      kv('Остановки / автобусы', `${tr.stops.length} / ${tr.buses.length}`),
      kv('Пассажиров за месяц', fmt(tr.ridersMonth)),
      kv('Зданий (заброшено)', `${fmt(st.buildings)} (${fmt(st.abandoned)})`),
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
  return h('div', { class: 'help', html: `
    <h4>Как играть</h4>
    <ol>
      <li>Проложите <b>дороги</b> (перетащите мышью по прямой).</li>
      <li>Постройте <b>электростанцию</b> и <b>водонапорную башню</b> рядом с дорогой — сеть питает всё, что связано с ней дорогами.</li>
      <li>Разметьте <b>зоны</b> вдоль дорог: жилую, коммерческую, промышленную. Следите за столбцами спроса вверху.</li>
      <li>Добавляйте <b>службы</b>: полиция, пожарные, больницы, школы, парки — они повышают счастье и стоимость земли.</li>
      <li>Ставьте <b>автобусные остановки</b> (минимум 2 в одной сети) — автобусы разгрузят дороги.</li>
      <li>Следите за <b>бюджетом</b> (клик по деньгам): налоги и финансирование служб.</li>
    </ol>
    <h4>Управление</h4>
    <ul>
      <li><b>ЛКМ</b> — действие инструмента; в режиме «Выбор» перетаскивание двигает камеру</li>
      <li><b>ПКМ</b> (зажать) — вращение; клик ПКМ — отмена инструмента</li>
      <li><b>СКМ</b> / <b>WASD</b> / стрелки — перемещение, <b>Q/E</b> — поворот, <b>R/F</b> — наклон, <b>колесо</b> — масштаб</li>
      <li><b>Пробел</b> — пауза, <b>1/2/3</b> — скорость, <b>X</b> — снос, <b>Esc</b> — выбор</li>
    </ul>` });
}
