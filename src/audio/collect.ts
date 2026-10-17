import type { Game } from '../core/Game';
import { Terrain } from '../world/Terrain';
import type { AmbientState } from './mixer';

export interface ListenerView {
  /** точка обзора камеры на земле */
  x: number;
  z: number;
  /** расстояние камеры */
  distance: number;
  /** ночь 0..1 */
  night: number;
}

const HEARD_RADIUS = 130;

/** Собирает состояние мира вокруг камеры для звукового микшера. */
export function collectAmbient(game: Game, view: ListenerView): AmbientState {
  const w = game.world;
  const near = w.buildingsNear(view.x, view.z, HEARD_RADIUS).filter((b) => Math.hypot(b.x - view.x, b.z - view.z) <= HEARD_RADIUS);
  let industry = 0;
  for (const b of near) if (b.zone === 'ind') industry++;
  let cars = 0;
  for (const v of game.get('traffic').vehicles) if (Math.hypot(v.x - view.x, v.z - view.z) <= HEARD_RADIUS) cars++;
  let water = 0;
  let samples = 0;
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      samples++;
      if (w.terrainAt(view.x + dx * 12, view.z + dz * 12) === Terrain.Water) water++;
    }
  }
  let fires = 0;
  let alarms = 0;
  for (const b of w.list()) {
    if (b.fire > 0) fires++;
    if (b.incident > 0) alarms++;
  }
  const sources: Record<string, number> = {};
  for (const b of near) {
    if (b.kind !== 'service') continue;
    const tag = game.services.require(b.defId).sound;
    if (!tag) continue;
    const d = Math.hypot(b.x - view.x, b.z - view.z);
    sources[tag] = (sources[tag] ?? 0) + (1 - d / HEARD_RADIUS) ** 2;
  }
  return {
    zoom: view.distance,
    buildingsNear: near.length,
    vehiclesNear: cars,
    industryNear: industry,
    waterNear: water / samples,
    trafficFlow: game.get('stats').trafficFlow,
    night: view.night,
    fires,
    speed: game.speed,
    sources,
    alarms,
  };
}
