import { generateTerrain, type TerrainParams } from '../world/Terrain';
import { computeMaps } from './maps';
import { PathFinder } from './pathfinder';
import type { GraphSnapshot, MapsInput, PathRequest, WorkerRequest, WorkerResponse } from './protocol';

/** Воркер тяжёлых вычислений: генерация рельефа, карты влияния, поиск пути. */
const finder = new PathFinder();
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(msg: WorkerResponse, transfer?: Transferable[]): void;
};

scope.onmessage = (e) => {
  const { op, id, payload } = e.data;
  switch (op) {
    case 'terrain': {
      const r = generateTerrain(payload as TerrainParams);
      scope.postMessage({ id, result: r }, [r.heights.buffer, r.terrain.buffer]);
      break;
    }
    case 'graph':
      finder.setGraph(payload as GraphSnapshot);
      break;
    case 'occupancy':
      finder.setOccupancy(payload as Float32Array);
      break;
    case 'path':
      scope.postMessage({ id, result: finder.find(payload as PathRequest) });
      break;
    case 'maps': {
      const r = computeMaps(payload as MapsInput);
      const transfer: Transferable[] = [r.landValue.buffer as ArrayBuffer];
      for (const a of Object.values(r.layers)) transfer.push(a.buffer as ArrayBuffer);
      scope.postMessage({ id, result: r }, transfer);
      break;
    }
  }
};
