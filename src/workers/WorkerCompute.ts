import type { TerrainData, TerrainParams } from '../world/Terrain';
import type { ComputeBackend, GraphSnapshot, MapsInput, MapsOutput, PathRequest, PathResult, WorkerOp, WorkerRequest, WorkerResponse } from './protocol';

/** Выполняет тяжёлые расчёты в Web Worker, не блокируя отрисовку. */
export class WorkerCompute implements ComputeBackend {
  private _worker: Worker;
  private _pending = new Map<number, (r: unknown) => void>();
  private _next = 1;

  constructor() {
    this._worker = new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module' });
    this._worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const done = this._pending.get(e.data.id);
      if (done) {
        this._pending.delete(e.data.id);
        done(e.data.result);
      }
    };
  }

  private _call<T>(op: WorkerOp, payload: unknown, transfer: Transferable[] = []): Promise<T> {
    const id = this._next++;
    return new Promise<T>((resolve) => {
      this._pending.set(id, resolve as (r: unknown) => void);
      const msg: WorkerRequest = { op, id, payload };
      this._worker.postMessage(msg, transfer);
    });
  }

  private _send(op: WorkerOp, payload: unknown): void {
    const msg: WorkerRequest = { op, id: 0, payload };
    this._worker.postMessage(msg);
  }

  generateTerrain(p: TerrainParams): Promise<TerrainData> {
    return this._call('terrain', p);
  }

  setGraph(s: GraphSnapshot): void {
    this._send('graph', s);
  }

  setOccupancy(_version: number, occ: Float32Array): void {
    this._send('occupancy', occ);
  }

  findPath(req: PathRequest): Promise<PathResult> {
    return this._call('path', req);
  }

  computeMaps(input: MapsInput): Promise<MapsOutput> {
    return this._call('maps', input);
  }

  dispose(): void {
    this._worker.terminate();
    this._pending.clear();
  }
}

/** Создаёт воркер-бэкенд, а при недоступности Worker — вызывающий код подставит InlineCompute. */
export const workersSupported = (): boolean => typeof Worker !== 'undefined';
