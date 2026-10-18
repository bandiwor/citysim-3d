import type { Game } from '../core/Game';
import type { System } from '../core/System';
import { t } from '../i18n';

declare module '../core/Game' {
  interface SystemMap {
    trade: TradeSystem;
  }
}

export type Side = 'n' | 'e' | 's' | 'w';

/** Выезд к соседнему городу: узел дороги у края карты. */
export interface TradeLink {
  node: number;
  x: number;
  z: number;
  side: Side;
  comp: number;
}

export interface TradeSettings {
  importPower: boolean;
  importWater: boolean;
  exportPower: boolean;
  exportWater: boolean;
  exportGoods: boolean;
}

export interface TradeMonth {
  powerSold: number;
  waterSold: number;
  goods: number;
  powerBought: number;
  waterBought: number;
  income: number;
  expense: number;
}

/** число вариантов имён соседей в словаре (neighbor.0 … neighbor.N-1) */
const NAMES = 12;

/**
 * Соседние города. Дорога, доведённая до края карты, — выезд: через него город продаёт излишки энергии и воды,
 * докупает недостающее (дороже), вывозит сырьё специализированной промышленности, а спрос на коммерцию и промышленность растёт.
 * Импорт и экспорт работают в той части дорожной сети, которая связана с выездом.
 */
export class TradeSystem implements System {
  readonly id = 'trade';
  readonly order = 15;
  links: TradeLink[] = [];
  settings: TradeSettings = { importPower: true, importWater: true, exportPower: true, exportWater: true, exportGoods: true };
  /** имена соседей по сторонам света (ключи i18n) */
  neighbors = {} as Record<Side, string>;
  private _linked = new Map<number, number>();
  private _netVersion = -1;
  private _game!: Game;

  init(game: Game): void {
    this._game = game;
    // каждой стороне — свой сосед, имена различаются и зависят от карты
    const order = Array.from({ length: NAMES }, (_, i) => i).sort((a, b) => ((a * 7919 + game.world.seed) % 97) - ((b * 7919 + game.world.seed) % 97));
    (['n', 'e', 's', 'w'] as Side[]).forEach((s, i) => (this.neighbors[s] = `neighbor.${order[i]}`));
  }

  update(): void {
    const net = this._game.get('network');
    if (net.version === this._netVersion) return;
    this._netVersion = net.version;
    this._findLinks();
  }

  get connected(): boolean {
    return this.links.length > 0;
  }

  /** Связана ли компонента дорожной сети с соседями. */
  isLinked(comp: number): boolean {
    return this._linked.has(comp);
  }

  /** Сколько можно докупить в этой компоненте сети (0 — нет выезда или импорт выключен). */
  importCap(comp: number, kind: 'power' | 'water'): number {
    const n = this._linked.get(comp) ?? 0;
    if (!n || !(kind === 'power' ? this.settings.importPower : this.settings.importWater)) return 0;
    return n * this._game.config.trade.importPerLink[kind];
  }

  canExport(kind: 'power' | 'water'): boolean {
    return kind === 'power' ? this.settings.exportPower : this.settings.exportWater;
  }

  set(key: keyof TradeSettings, v: boolean): void {
    this.settings[key] = v;
    this._game.bus.emit('trade:changed');
    this._game.bus.emit('economy:changed');
    // импорт меняет снабжение: коммуналка пересчитается
    this._game.bus.emit('mods:changed');
  }

  /** Торговый баланс месяца по текущим потокам. */
  month(): TradeMonth {
    const g = this._game;
    const c = g.config.trade;
    const u = g.get('utility');
    let goods = 0;
    if (this.settings.exportGoods && this.connected) {
      const res = g.get('resources');
      if (res) for (const b of g.world.list()) if (b.spec && this.isLinked(b.comp)) goods += res.goodsValue(b);
    }
    const powerSold = u.powerExport * c.powerSell;
    const waterSold = u.waterExport * c.waterSell;
    const powerBought = u.powerImport * c.powerBuy;
    const waterBought = u.waterImport * c.waterBuy;
    return { powerSold, waterSold, goods, powerBought, waterBought, income: powerSold + waterSold + goods, expense: powerBought + waterBought };
  }

  private _findLinks(): void {
    const g = this._game;
    const w = g.world;
    const net = g.get('network');
    const r = g.config.trade.edgeRange;
    const ext = w.extent;
    const was = this.links.length;
    this.links = [];
    this._linked.clear();
    for (const n of w.graph.nodes.values()) {
      const d = { w: n.x, e: ext - n.x, n: n.z, s: ext - n.z };
      const side = (Object.keys(d) as Side[]).reduce((a, b) => (d[a] <= d[b] ? a : b));
      if (d[side] > r) continue;
      // тупик или пересечение у края — выезд; узлы посередине длинной дороги вдоль края тоже считаются
      const comp = net.compOfNode(n.id);
      if (comp < 0) continue;
      this.links.push({ node: n.id, x: n.x, z: n.z, side, comp });
      this._linked.set(comp, (this._linked.get(comp) ?? 0) + 1);
    }
    const mods = g.get('mods');
    const c = g.config.trade;
    if (this.links.length) mods.put({ id: 'trade', icon: '🚛', nameKey: 'mod.trade', until: null, add: { demandInd: c.demandInd, demandCom: c.demandCom } });
    else mods.remove('trade');
    if (!was && this.links.length) g.message('msg.tradeLinked', { name: t(this.neighbors[this.links[0].side]) }, 'good');
    g.bus.emit('trade:changed');
  }

  saveState(): unknown {
    return this.settings;
  }

  loadState(data: unknown): void {
    if (data && typeof data === 'object') Object.assign(this.settings, data);
  }
}
