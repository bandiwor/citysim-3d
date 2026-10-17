import { generateTerrain, type TerrainData, type TerrainParams } from '../world/Terrain';
import { computeMaps } from './maps';
import { PathFinder } from './pathfinder';
import type { ComputeBackend, GraphSnapshot, MapsInput, MapsOutput, PathRequest, PathResult } from './protocol';

/** Синхронная реализация (тесты, окружения без Worker). Тот же код, что исполняется в воркере. */
export class InlineCompute implements ComputeBackend {
  private _finder = new PathFinder();

  generateTerrain(p: TerrainParams): Promise<TerrainData> {
    return Promise.resolve(generateTerrain(p));
  }

  setGraph(s: GraphSnapshot): void {
    this._finder.setGraph(s);
  }

  setOccupancy(_version: number, occ: Float32Array): void {
    this._finder.setOccupancy(occ);
  }

  findPath(req: PathRequest): Promise<PathResult> {
    return Promise.resolve(this._finder.find(req));
  }

  computeMaps(input: MapsInput): Promise<MapsOutput> {
    return Promise.resolve(computeMaps(input));
  }

  dispose(): void {}
}
