import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/gameConfig';
import { WorkerCompute } from '../src/workers/WorkerCompute';
import { terrainParams } from '../src/world/Terrain';

type G = { Worker?: unknown };
const g = globalThis as unknown as G;
const original = g.Worker;

afterEach(() => {
  g.Worker = original;
});

describe('WorkerCompute: откат на основной поток', () => {
  it('если Worker не создаётся, все вызовы выполняются синхронным вычислителем', async () => {
    g.Worker = class {
      constructor() {
        throw new Error('blocked');
      }
    };
    const c = new WorkerCompute();
    expect(c.inline).toBe(true);
    const t = await c.generateTerrain(terrainParams(defaultConfig, 4, 16));
    expect(t.size).toBe(16);
    const m = await c.computeMaps({ size: 4, cell: 8, sources: [], layers: ['police'], shore: new Float32Array(16), landValue: { base: 0.3, weights: {} } });
    expect(m.layers.police).toHaveLength(16);
  });

  it('если воркер падает после создания, ожидающие запросы дорешиваются и состояние графа переносится', async () => {
    const instances: { onerror?: () => void; terminated: boolean }[] = [];
    g.Worker = class {
      onerror?: () => void;
      onmessage?: unknown;
      onmessageerror?: unknown;
      terminated = false;
      constructor() {
        instances.push(this);
      }
      postMessage(): void {}
      terminate(): void {
        this.terminated = true;
      }
    };
    const c = new WorkerCompute();
    expect(c.inline).toBe(false);
    c.setGraph({ version: 1, nodeCount: 2, edgeCount: 1, nodeX: Float32Array.from([0, 40]), nodeZ: new Float32Array(2), edgeA: Int32Array.from([0]), edgeB: Int32Array.from([1]), edgeLen: Float32Array.from([40]), edgeSpeed: Float32Array.from([14]), edgeCap: Float32Array.from([10]), edgeIds: Int32Array.from([7]), congestionPower: 2, minFlow: 0.3 });
    const pending = c.generateTerrain(terrainParams(defaultConfig, 2, 12));
    const path = c.findPath({ id: 1, version: 1, fromEdge: 0, fromS: 5, toEdge: 0, toS: 30 });
    instances[0].onerror?.();
    expect(instances[0].terminated).toBe(true);
    expect(c.inline).toBe(true);
    expect((await pending).size).toBe(12);
    const res = await path;
    expect(res.ok).toBe(true);
    expect(res.steps).toEqual([1]);
  });
});
