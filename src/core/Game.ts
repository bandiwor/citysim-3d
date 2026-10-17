import type { RoadType } from '../data/roads';
import type { ServiceDef } from '../data/services';
import type { ZoneType } from '../data/zones';
import { Builder } from '../sim/Builder';
import { World } from '../world/World';
import { EventBus } from './EventBus';
import type { GameEvents } from './events';
import { Registry } from './Registry';
import type { Feature, System } from './System';
import type { ToolbarCategory, ToolbarItem } from './Tool';
import type { MessageKind } from './types';

/**
 * Карта систем. Каждая механика дополняет её через declaration merging:
 *   declare module '../core/Game' { interface SystemMap { economy: EconomySystem } }
 * и получает типобезопасный доступ game.get('economy').
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SystemMap {}

export interface OverlayDef {
  id: string;
  name: string;
  icon: string;
  /** Заполняет rgba (0..255) для клетки i. Вернуть false — клетка не окрашивается. */
  colorize(game: Game, i: number, out: Uint8ClampedArray): boolean;
}

export interface GameOptions {
  seed: number;
  size?: number;
}

export class Game {
  readonly bus = new EventBus<GameEvents>();
  readonly world: World;
  readonly roadTypes = new Registry<RoadType>();
  readonly zoneTypes = new Registry<ZoneType>();
  readonly services = new Registry<ServiceDef>();
  readonly overlays = new Registry<OverlayDef>();
  readonly toolbar = new Registry<ToolbarItem>();
  readonly categories: ToolbarCategory[] = [];
  readonly builder: Builder;
  /** множитель скорости: 0 — пауза */
  speed = 1;
  private _systems: System[] = [];
  private _byId = new Map<string, System>();
  private _started = false;

  constructor(readonly options: GameOptions) {
    this.world = new World(options.size ?? 80, options.seed);
    this.builder = new Builder(this);
  }

  /** Подключить фичу (пакет систем/данных/инструментов). */
  use(feature: Feature): this {
    feature.install(this);
    return this;
  }

  addSystem<T extends System>(system: T): T {
    this._systems.push(system);
    this._systems.sort((a, b) => a.order - b.order);
    this._byId.set(system.id, system);
    if (this._started) system.init?.(this);
    return system;
  }

  get<K extends keyof SystemMap>(id: K): SystemMap[K] {
    return this._byId.get(id as string) as unknown as SystemMap[K];
  }

  addCategory(cat: ToolbarCategory): void {
    this.categories.push(cat);
  }

  start(): void {
    this._started = true;
    for (const s of this._systems) s.init?.(this);
  }

  /** Один кадр симуляции. */
  step(realDt: number): void {
    const dt = Math.min(realDt, 0.1) * this.speed;
    const rdt = Math.min(realDt, 0.1);
    for (const s of this._systems) s.update?.(dt, rdt);
  }

  setSpeed(v: number): void {
    this.speed = v;
    this.bus.emit('speed:changed', v);
  }

  message(text: string, kind: MessageKind = 'info'): void {
    this.bus.emit('message', { text, kind });
  }
}
