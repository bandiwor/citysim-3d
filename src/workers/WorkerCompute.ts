import type { TerrainData, TerrainParams } from '../world/Terrain';
import { InlineCompute } from './InlineCompute';
import type { ComputeBackend, GraphSnapshot, MapsInput, MapsOutput, PathRequest, PathResult, WorkerOp, WorkerRequest, WorkerResponse } from './protocol';

interface Pending {
  op: WorkerOp;
  payload: unknown;
  resolve(r: unknown): void;
}

/**
 * Выполняет тяжёлые расчёты в Web Worker, не блокируя отрисовку.
 * Если воркер не удалось создать или он упал (ограничения окружения), расчёты прозрачно
 * переключаются на основной поток (InlineCompute) — игра продолжает работать.
 */
export class WorkerCompute implements ComputeBackend {
  private _worker: Worker | null = null;
  private _pending = new Map<number, Pending>();
  private _next = 1;
  private _inline = new InlineCompute();
  private _lastGraph: GraphSnapshot | null = null;
  private _lastOcc: { version: number; occ: Float32Array } | null = null;

  constructor() {
    try {
      const w = new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const p = this._pending.get(e.data.id);
        if (p) {
          this._pending.delete(e.data.id);
          p.resolve(e.data.result);
        }
      };
      w.onerror = () => this._fallback();
      w.onmessageerror = () => this._fallback();
      this._worker = w;
    } catch {
      this._worker = null;
    }
  }

  /** true, если расчёты идут не в воркере */
  get inline(): boolean {
    return !this._worker;
  }

  /** Воркер недоступен: подхватываем состояние и дорешиваем ожидающие запросы на основном потоке. */
  private _fallback(): void {
    if (!this._worker) return;
    this._worker.terminate();
    this._worker = null;
    if (this._lastGraph) this._inline.setGraph(this._lastGraph);
    if (this._lastOcc) this._inline.setOccupancy(this._lastOcc.version, this._lastOcc.occ);
    const pending = [...this._pending.values()];
    this._pending.clear();
    for (const p of pending) void this._inlineCall(p.op, p.payload).then(p.resolve);
  }

  private _inlineCall(op: WorkerOp, payload: unknown): Promise<unknown> {
    switch (op) {
      case 'terrain':
        return this._inline.generateTerrain(payload as TerrainParams);
      case 'path':
        return this._inline.findPath(payload as PathRequest);
      case 'maps':
        return this._inline.computeMaps(payload as MapsInput);
      default:
        return Promise.resolve(null);
    }
  }

  private _call<T>(op: WorkerOp, payload: unknown): Promise<T> {
    if (!this._worker) return this._inlineCall(op, payload) as Promise<T>;
    const id = this._next++;
    return new Promise<T>((resolve) => {
      this._pending.set(id, { op, payload, resolve: resolve as (r: unknown) => void });
      const msg: WorkerRequest = { op, id, payload };
      this._worker!.postMessage(msg);
    });
  }

  private _send(op: WorkerOp, payload: unknown): void {
    const msg: WorkerRequest = { op, id: 0, payload };
    this._worker?.postMessage(msg);
  }

  generateTerrain(p: TerrainParams): Promise<TerrainData> {
    return this._call('terrain', p);
  }

  setGraph(s: GraphSnapshot): void {
    this._lastGraph = s;
    if (this._worker) this._send('graph', s);
    else this._inline.setGraph(s);
  }

  setOccupancy(version: number, occ: Float32Array): void {
    this._lastOcc = { version, occ };
    if (this._worker) this._send('occupancy', occ);
    else this._inline.setOccupancy(version, occ);
  }

  findPath(req: PathRequest): Promise<PathResult> {
    return this._call('path', req);
  }

  computeMaps(input: MapsInput): Promise<MapsOutput> {
    return this._call('maps', input);
  }

  dispose(): void {
    this._worker?.terminate();
    this._worker = null;
    this._pending.clear();
  }
}

export const workersSupported = (): boolean => typeof Worker !== 'undefined';
