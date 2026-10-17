import type { DeepPartial, GameConfig } from '../src/config/gameConfig';
import { Game } from '../src/core/Game';
import { coreFeature, disastersFeature, roadsFeature, servicesFeature, trafficFeature, zonesFeature } from '../src/features';
import type { RoadSnap } from '../src/sim/Builder';
import { flatTerrain } from '../src/world/Terrain';

export interface TestGameOptions {
  size?: number;
  config?: DeepPartial<GameConfig>;
  money?: number;
  start?: boolean;
}

/** Игра на ровной карте с синхронным вычислителем (без воркеров) и всеми фичами. */
export function createGame(o: TestGameOptions = {}): Game {
  const size = o.size ?? 60;
  const game = new Game({ seed: 1, terrain: flatTerrain(size), config: { disasters: { enabled: false }, progress: { enabled: false }, ...o.config } });
  game.use(roadsFeature).use(zonesFeature).use(servicesFeature).use(trafficFeature).use(coreFeature).use(disastersFeature);
  if (o.start !== false) {
    game.start();
    game.get('economy').money = o.money ?? 1e9;
  }
  return game;
}

export const free = (x: number, z: number): RoadSnap => ({ x, z, kind: 'free' });

/** Проложить прямую дорогу между двумя точками (с привязкой к существующим узлам/дорогам). */
export function road(game: Game, x0: number, z0: number, x1: number, z1: number, type = 'street'): boolean {
  const b = game.builder;
  const plan = b.planRoad(b.snap(x0, z0), b.snap(x1, z1), null, type);
  return b.buildRoad(plan).ok;
}

/** Шаги симуляции с отдачей управления промисам (результаты путей приходят асинхронно). */
export async function run(game: Game, seconds: number, dt = 0.1): Promise<void> {
  for (let t = 0; t < seconds; t += dt) {
    game.step(dt);
    await Promise.resolve();
    await Promise.resolve();
  }
}

/** Пересобрать сеть и дождаться асинхронных пересчётов. */
export async function settle(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    game.step(0.1);
    await Promise.resolve();
    await Promise.resolve();
  }
}
