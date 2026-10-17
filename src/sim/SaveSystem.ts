import type { Game } from '../core/Game';
import type { System } from '../core/System';

declare module '../core/Game' {
  interface SystemMap {
    save: SaveSystem;
  }
}

interface SavedBuilding {
  k: 'zone' | 'service';
  d: string;
  x: number;
  y: number;
  l: number;
  v: number;
  r: number;
  p: number;
  g: number;
  a: number;
}

export interface SaveData {
  v: 1;
  seed: number;
  size: number;
  time: { day: number; month: number; year: number; tod: number; total: number };
  money: number;
  debt: number;
  taxes: Record<string, number>;
  funding: Record<string, number>;
  roads: string;
  zones: string;
  stops: number[];
  buildings: SavedBuilding[];
  history: { net: number[]; pop: number[]; money: number[] };
}

const KEY = 'citysim3d.save.v1';

const enc = (a: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode(...a.subarray(i, i + 8192));
  return btoa(s);
};
const dec = (s: string, into: Uint8Array): void => {
  const bin = atob(s);
  for (let i = 0; i < bin.length && i < into.length; i++) into[i] = bin.charCodeAt(i);
};

/** Сохранение в localStorage. Формат — явный и не зависит от имён внутренних полей. */
export class SaveSystem implements System {
  readonly id = 'save';
  readonly order = 90;
  private _game!: Game;

  static peek(): SaveData | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as SaveData) : null;
    } catch {
      return null;
    }
  }

  init(game: Game): void {
    this._game = game;
    let months = 0;
    game.bus.on('time:month', () => {
      if (++months % 3 === 0) this.save(true);
    });
  }

  save(silent = false): boolean {
    const g = this._game;
    const w = g.world;
    const t = g.get('time');
    const e = g.get('economy');
    const data: SaveData = {
      v: 1,
      seed: w.seed,
      size: w.size,
      time: { day: t.day, month: t.month, year: t.year, tod: t.tod, total: t.totalDays },
      money: e.money,
      debt: e.debt,
      taxes: { ...e.taxes },
      funding: { ...e.funding },
      roads: enc(w.road),
      zones: enc(w.zone),
      stops: g.get('transit').stops.slice(),
      buildings: w.list().map((b) => ({
        k: b.kind,
        d: b.defId,
        x: b.x,
        y: b.y,
        l: b.level,
        v: b.variant,
        r: b.rot,
        p: Math.round(b.pop),
        g: b.goods,
        a: b.abandoned ? 1 : 0,
      })),
      history: { net: e.history.net, pop: e.history.pop, money: e.history.money },
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      if (!silent) g.message('Игра сохранена', 'good');
      return true;
    } catch {
      g.message('Не удалось сохранить игру', 'bad');
      return false;
    }
  }

  /** Применяет сохранение к свежесозданной игре (до game.start()). */
  static apply(g: Game, d: SaveData): void {
    const w = g.world;
    dec(d.roads, w.road);
    dec(d.zones, w.zone);
    for (const c of d.stops) w.stop[c] = 1;
    for (const s of d.buildings) {
      const def = s.k === 'zone' ? null : g.services.get(s.d);
      const bw = def ? def.size[0] : 1;
      const bh = def ? def.size[1] : 1;
      if (s.k === 'zone' ? !g.zoneTypes.has(s.d) : !def) continue;
      const b = g.builder.createBuilding(s.k, s.d, s.x, s.y, bw, bh);
      b.level = s.l;
      b.variant = s.v;
      b.rot = s.r;
      g.builder.applyStats(b);
      b.pop = Math.min(s.p, b.cap);
      b.goods = s.g;
      b.abandoned = !!s.a;
      g.builder.addBuilding(b);
    }
    const t = g.get('time');
    Object.assign(t, { day: d.time.day, month: d.time.month, year: d.time.year, tod: d.time.tod, totalDays: d.time.total });
    const e = g.get('economy');
    e.money = d.money;
    e.debt = d.debt;
    Object.assign(e.taxes, d.taxes);
    Object.assign(e.funding, d.funding);
    e.history = d.history;
    g.get('transit').stops = d.stops.slice();
  }
}
