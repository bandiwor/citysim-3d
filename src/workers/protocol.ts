import type { TerrainData, TerrainParams } from '../world/Terrain';

/** Компактный снимок графа дорог для поиска пути (индексы узлов/рёбер плотные: 0..n-1). */
export interface GraphSnapshot {
  version: number;
  nodeCount: number;
  edgeCount: number;
  nodeX: Float32Array;
  nodeZ: Float32Array;
  edgeA: Int32Array;
  edgeB: Int32Array;
  edgeLen: Float32Array;
  edgeSpeed: Float32Array;
  edgeCap: Float32Array;
  /** 1 — одностороннее ребро (только a → b) */
  edgeOneway: Uint8Array;
  /** индекс ребра → id ребра в RoadGraph */
  edgeIds: Int32Array;
  congestionPower: number;
  minFlow: number;
}

export interface PathRequest {
  id: number;
  /** версия снимка, для которой считается путь */
  version: number;
  fromEdge: number;
  fromS: number;
  toEdge: number;
  toS: number;
}

export interface PathResult {
  id: number;
  version: number;
  ok: boolean;
  /** шаги пути: (индекс ребра + 1) * направление (+1 / −1) */
  steps: number[];
}

export interface MapSource {
  layer: string;
  x: number;
  z: number;
  /** радиус влияния, ед. */
  r: number;
  strength: number;
  /** суммировать (загрязнение, шум) вместо максимума (покрытие служб) */
  additive: boolean;
}

export interface MapsInput {
  size: number;
  cell: number;
  sources: MapSource[];
  /** слои, которые нужно вернуть даже без источников */
  layers: string[];
  shore: Float32Array;
  landValue: { base: number; weights: Record<string, number> };
}

export interface MapsOutput {
  layers: Record<string, Float32Array>;
  landValue: Float32Array;
}

/** Бэкенд тяжёлых вычислений: в браузере — Web Worker, в тестах — синхронный. */
export interface ComputeBackend {
  generateTerrain(p: TerrainParams): Promise<TerrainData>;
  setGraph(snapshot: GraphSnapshot): void;
  setOccupancy(version: number, occupancy: Float32Array): void;
  findPath(req: PathRequest): Promise<PathResult>;
  computeMaps(input: MapsInput): Promise<MapsOutput>;
  dispose(): void;
}

export type WorkerOp = 'terrain' | 'graph' | 'occupancy' | 'path' | 'maps';

export interface WorkerRequest {
  op: WorkerOp;
  id: number;
  payload: unknown;
}

export interface WorkerResponse {
  id: number;
  result: unknown;
}
