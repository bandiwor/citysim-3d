import type { Game } from '../core/Game';
import type { System } from '../core/System';
import type { GraphSnapshot } from '../workers/protocol';

declare module '../core/Game' {
  interface SystemMap {
    network: NetworkSystem;
  }
}

export interface PathStep {
  edge: number;
  dir: 1 | -1;
}

/**
 * Дорожная сеть: компоненты связности (они же сети электричества и воды), доступ зданий к дорогам,
 * снимок графа для воркера и асинхронный поиск пути.
 */
export class NetworkSystem implements System {
  readonly id = 'network';
  readonly order = 10;
  compCount = 0;
  /** растёт при каждой пересборке сети */
  version = 0;
  private _game!: Game;
  private _comp = new Map<number, number>();
  private _graphVersion = -1;
  private _snapshot: GraphSnapshot | null = null;
  private _edgeIndex = new Map<number, number>();
  private _nextReq = 1;

  init(game: Game): void {
    this._game = game;
    game.bus.on('building:added', (b) => {
      b.comp = this.compOfEdge(b.access);
    });
  }

  update(): void {
    if (this._game.world.graph.version !== this._graphVersion) this.rebuild();
  }

  /** Компонента связности узла (−1 — неизвестен). */
  compOfNode(node: number): number {
    return this._comp.get(node) ?? -1;
  }

  /** Компонента связности ребра (−1, если ребра нет). */
  compOfEdge(edge: number): number {
    const e = this._game.world.graph.edges.get(edge);
    return e ? (this._comp.get(e.a) ?? -1) : -1;
  }

  rebuild(): void {
    const game = this._game;
    const world = game.world;
    game.builder.refreshAccess();
    const { node, count } = world.graph.components();
    this._comp = node;
    this.compCount = count;
    this._graphVersion = world.graph.version;
    for (const b of world.list()) b.comp = this.compOfEdge(b.access);
    this._snapshot = this._buildSnapshot();
    game.compute.setGraph(this._snapshot);
    this.version++;
  }

  /** Вместимость ребра: сколько машин комфортно едет по нему одновременно. */
  capacityOf(edge: { len: number; type: number }): number {
    const c = this._game.config.traffic;
    return Math.max(2, Math.round((edge.len / c.vehicleSpacing) * this._game.roadTypes.at(edge.type).lanes));
  }

  private _buildSnapshot(): GraphSnapshot {
    const game = this._game;
    const graph = game.world.graph;
    const nodeIdx = new Map<number, number>();
    const nodeCount = graph.nodes.size;
    const nodeX = new Float32Array(nodeCount);
    const nodeZ = new Float32Array(nodeCount);
    let i = 0;
    for (const n of graph.nodes.values()) {
      nodeIdx.set(n.id, i);
      nodeX[i] = n.x;
      nodeZ[i] = n.z;
      i++;
    }
    const edgeCount = graph.edges.size;
    const edgeA = new Int32Array(edgeCount);
    const edgeB = new Int32Array(edgeCount);
    const edgeLen = new Float32Array(edgeCount);
    const edgeSpeed = new Float32Array(edgeCount);
    const edgeCap = new Float32Array(edgeCount);
    const edgeOneway = new Uint8Array(edgeCount);
    const edgeIds = new Int32Array(edgeCount);
    this._edgeIndex.clear();
    let k = 0;
    for (const e of graph.edges.values()) {
      this._edgeIndex.set(e.id, k);
      edgeIds[k] = e.id;
      edgeA[k] = nodeIdx.get(e.a)!;
      edgeB[k] = nodeIdx.get(e.b)!;
      edgeLen[k] = e.len;
      edgeSpeed[k] = game.roadTypes.at(e.type).speed;
      edgeCap[k] = this.capacityOf(e);
      edgeOneway[k] = e.oneway ? 1 : 0;
      k++;
    }
    return { version: this.version + 1, nodeCount, edgeCount, nodeX, nodeZ, edgeA, edgeB, edgeLen, edgeSpeed, edgeCap, edgeOneway, edgeIds, congestionPower: game.config.traffic.congestionPower, minFlow: game.config.traffic.minFlow };
  }

  /** Передаёт воркеру загруженность рёбер (id ребра → число машин). */
  syncOccupancy(occ: ReadonlyMap<number, number>): void {
    if (!this._snapshot) return;
    const arr = new Float32Array(this._snapshot.edgeCount);
    for (const [edge, n] of occ) {
      const idx = this._edgeIndex.get(edge);
      if (idx !== undefined) arr[idx] = n;
    }
    this._game.compute.setOccupancy(this._snapshot.version, arr);
  }

  /**
   * Асинхронный поиск пути между точками на рёбрах. Возвращает шаги по рёбрам (id + направление)
   * либо null, если пути нет или сеть изменилась за время расчёта.
   */
  async requestPath(fromEdge: number, fromS: number, toEdge: number, toS: number): Promise<PathStep[] | null> {
    const snap = this._snapshot;
    if (!snap) return null;
    const a = this._edgeIndex.get(fromEdge);
    const b = this._edgeIndex.get(toEdge);
    if (a === undefined || b === undefined) return null;
    const res = await this._game.compute.findPath({ id: this._nextReq++, version: snap.version, fromEdge: a, fromS, toEdge: b, toS });
    if (!res.ok || !this._snapshot || res.version !== this._snapshot.version) return null;
    return res.steps.map((v) => ({ edge: snap.edgeIds[Math.abs(v) - 1], dir: (v > 0 ? 1 : -1) as 1 | -1 }));
  }
}
