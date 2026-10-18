import { defaultConfig, mergeConfig, type DeepPartial, type GameConfig } from '../config/gameConfig';
import type { PolicyDef } from '../data/policies';
import type { RoadType } from '../data/roads';
import type { ServiceDef } from '../data/services';
import type { ZoneType } from '../data/zones';
import { Builder } from '../sim/Builder';
import { InlineCompute } from '../workers/InlineCompute';
import type { ComputeBackend } from '../workers/protocol';
import { CHEATS_OFF, type Cheats } from './cheats';
import { generateTerrain, terrainParams, type TerrainData, type TerrainStyle } from '../world/Terrain';
import { World } from '../world/World';
import { EventBus } from './EventBus';
import type { GameEvents } from './events';
import { Registry } from './Registry';
import type { Feature, System } from './System';
import type { ToolbarCategory, ToolbarItem } from './Tool';
import type { MessageKind, MessageParams } from './types';

/**
 * Карта систем. Каждая механика дополняет её через declaration merging:
 *   declare module '../core/Game' { interface SystemMap { economy: EconomySystem } }
 * и получает типобезопасный доступ game.get('economy').
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SystemMap {}

/** Тепловая карта: рисует клетки сетки через painter. */
export interface OverlayPainter {
  size: number;
  cell: number;
  /** окрасить клетку сетки i цветом (0..255) */
  set(i: number, r: number, g: number, b: number, a: number): void;
}

export interface OverlayDef {
  id: string;
  icon: string;
  paint(game: Game, p: OverlayPainter): void;
}

export interface GameOptions {
  seed: number;
  /** готовый рельеф (например, из воркера); иначе генерируется синхронно */
  terrain?: TerrainData;
  size?: number;
  /** читы (см. core/cheats.ts) */
  cheats?: Partial<Cheats>;
  /** стиль ландшафта (сохраняется вместе с игрой) */
  terrainStyle?: TerrainStyle;
  config?: DeepPartial<GameConfig>;
  compute?: ComputeBackend;
}

export class Game {
  readonly bus = new EventBus<GameEvents>();
  readonly config: GameConfig;
  readonly world: World;
  readonly compute: ComputeBackend;
  readonly roadTypes = new Registry<RoadType>();
  readonly zoneTypes = new Registry<ZoneType>();
  readonly services = new Registry<ServiceDef>();
  readonly policies = new Registry<PolicyDef>();
  readonly overlays = new Registry<OverlayDef>();
  readonly toolbar = new Registry<ToolbarItem>();
  readonly categories: ToolbarCategory[] = [];
  readonly builder: Builder;
  /** множитель скорости: 0 — пауза */
  speed = 1;
  private _systems: System[] = [];
  private _byId = new Map<string, System>();
  private _started = false;

  readonly terrainStyle: TerrainStyle | undefined;
  readonly cheats: Cheats;

  constructor(readonly options: GameOptions) {
    this.terrainStyle = options.terrainStyle;
    this.cheats = { ...CHEATS_OFF, ...options.cheats };
    const ch = this.cheats;
    const overrides: DeepPartial<GameConfig> = {
      ...options.config,
      ...(ch.instantBuild ? { construction: { ...options.config?.construction, enabled: false } } : {}),
      ...(ch.noDisasters ? { disasters: { ...options.config?.disasters, enabled: false } } : {}),
      ...(ch.startMoney > 0 ? { economy: { ...options.config?.economy, startMoney: ch.startMoney } } : {}),
    };
    this.config = mergeConfig({ ...overrides, ...(options.size ? { world: { ...options.config?.world, size: options.size } } : {}) });
    this.compute = options.compute ?? new InlineCompute();
    const terrain = options.terrain ?? generateTerrain(terrainParams(this.config, options.seed, undefined, options.terrainStyle));
    this.world = new World(terrain, options.seed, this.config);
    this.speed = 1;
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

  /** Все механики (в порядке обновления). */
  systems(): readonly System[] {
    return this._systems;
  }

  addCategory(cat: ToolbarCategory): void {
    if (this.categories.some((c) => c.id === cat.id)) return;
    this.categories.push(cat);
  }

  start(): void {
    this._started = true;
    for (const s of this._systems) s.init?.(this);
  }

  /** Один кадр симуляции. */
  step(realDt: number): void {
    const rdt = Math.min(realDt, 0.1);
    const dt = rdt * this.speed;
    for (const s of this._systems) s.update?.(dt, rdt);
  }

  setSpeed(v: number): void {
    this.speed = v;
    this.bus.emit('speed:changed', v);
  }

  /** Сообщение игроку: key — ключ словаря i18n. */
  message(key: string, params?: MessageParams, kind: MessageKind = 'info'): void {
    this.bus.emit('message', { key, params, kind });
  }

  sfx(name: string): void {
    this.bus.emit('sfx', { name });
  }

  dispose(): void {
    for (const s of this._systems) s.dispose?.();
    this.compute.dispose();
  }
}

export { defaultConfig };
