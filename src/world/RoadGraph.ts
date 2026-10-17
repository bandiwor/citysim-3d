import { cumulative, dist, pointAtLength, pointSeg, projectOnPolyline, type PolyPoint, type Vec2 } from './geometry';
import { SpatialHash } from './SpatialHash';

export interface RoadNode {
  id: number;
  x: number;
  z: number;
  edges: number[];
}

export interface RoadEdge {
  id: number;
  a: number;
  b: number;
  /** индекс типа дороги в реестре */
  type: number;
  /** половина ширины дороги с обочинами */
  hw: number;
  /** к дороге подключаются здания и строятся зоны */
  access: boolean;
  pts: Vec2[];
  cum: number[];
  len: number;
  bridge: boolean;
  /** растёт при изменении геометрии (для инвалидации маршрутов) */
  rev: number;
}

export interface NearestHit extends PolyPoint {
  edge: RoadEdge;
  s: number;
  d: number;
}

export interface EdgeInit {
  type: number;
  hw: number;
  access: boolean;
  bridge: boolean;
}

const SEG = 512;

/** Граф дорог: узлы и рёбра-ломаные с пространственным индексом. Ничего не знает о типах дорог и экономике. */
export class RoadGraph {
  readonly nodes = new Map<number, RoadNode>();
  readonly edges = new Map<number, RoadEdge>();
  /** растёт при любом изменении топологии или геометрии */
  version = 0;
  private _nid = 1;
  private _eid = 1;
  private _hash = new SpatialHash(16);

  addNode(x: number, z: number): RoadNode {
    const n: RoadNode = { id: this._nid++, x, z, edges: [] };
    this.nodes.set(n.id, n);
    this.version++;
    return n;
  }

  /** Восстановление узла с известным id (загрузка сохранения). */
  restoreNode(id: number, x: number, z: number): RoadNode {
    const n: RoadNode = { id, x, z, edges: [] };
    this.nodes.set(id, n);
    if (id >= this._nid) this._nid = id + 1;
    this.version++;
    return n;
  }

  /** Ломаная pts начинается в узле a и заканчивается в узле b. */
  addEdge(a: number, b: number, pts: Vec2[], init: EdgeInit, id?: number): RoadEdge {
    const cum = cumulative(pts);
    const e: RoadEdge = { id: id ?? this._eid++, a, b, ...init, pts, cum, len: cum[cum.length - 1], rev: 0 };
    if (e.id >= this._eid) this._eid = e.id + 1;
    this.edges.set(e.id, e);
    this.nodes.get(a)!.edges.push(e.id);
    this.nodes.get(b)!.edges.push(e.id);
    this._index(e);
    this.version++;
    return e;
  }

  private _index(e: RoadEdge): void {
    for (let i = 0; i < e.pts.length - 1; i++) {
      const p = e.pts[i];
      const q = e.pts[i + 1];
      this._hash.insert(e.id * SEG + i, Math.min(p.x, q.x), Math.min(p.z, q.z), Math.max(p.x, q.x), Math.max(p.z, q.z));
    }
  }

  private _unindex(e: RoadEdge): void {
    for (let i = 0; i < e.pts.length - 1; i++) this._hash.remove(e.id * SEG + i);
  }

  removeEdge(id: number): void {
    const e = this.edges.get(id);
    if (!e) return;
    this._unindex(e);
    this.edges.delete(id);
    for (const nid of [e.a, e.b]) {
      const n = this.nodes.get(nid);
      if (!n) continue;
      n.edges = n.edges.filter((x) => x !== id);
      if (!n.edges.length) this.nodes.delete(nid);
    }
    this.version++;
  }

  /**
   * Делит ребро в ближайшей к (x, z) точке. Первая часть сохраняет id, вторая получает новый.
   * Возвращает созданный узел.
   */
  splitEdge(id: number, x: number, z: number): { node: RoadNode; first: RoadEdge; second: RoadEdge } {
    const e = this.edges.get(id)!;
    const pr = projectOnPolyline(e.pts, e.cum, { x, z });
    const node = this.addNode(pr.x, pr.z);
    const head = e.pts.slice(0, pr.seg + 1);
    const tail = e.pts.slice(pr.seg + 1);
    // не плодим вырожденные сегменты
    if (head.length && dist(head[head.length - 1], { x: pr.x, z: pr.z }) < 0.01) head.pop();
    if (tail.length && dist(tail[0], { x: pr.x, z: pr.z }) < 0.01) tail.shift();
    const mid = { x: pr.x, z: pr.z };
    const headPts = [...head, mid];
    const tailPts = [mid, ...tail];
    headPts[0] = { ...e.pts[0] };
    tailPts[tailPts.length - 1] = { ...e.pts[e.pts.length - 1] };

    this._unindex(e);
    const oldB = this.nodes.get(e.b)!;
    const init: EdgeInit = { type: e.type, hw: e.hw, access: e.access, bridge: e.bridge };
    e.b = node.id;
    e.pts = headPts;
    e.cum = cumulative(headPts);
    e.len = e.cum[e.cum.length - 1];
    e.rev++;
    this._index(e);
    node.edges.push(e.id);
    oldB.edges = oldB.edges.filter((x) => x !== e.id);
    const second = this.addEdge(node.id, oldB.id, tailPts, init);
    // addEdge добавил second в edges узлов node и oldB
    this.version++;
    return { node, first: e, second };
  }

  /** Рёбра, сегменты которых могут оказаться в радиусе r от точки. */
  edgesNear(x: number, z: number, r: number): RoadEdge[] {
    const ids = this._hash.query(x - r, z - r, x + r, z + r);
    const seen = new Set<number>();
    const out: RoadEdge[] = [];
    for (const h of ids) {
      const eid = Math.floor(h / SEG);
      if (seen.has(eid)) continue;
      seen.add(eid);
      const e = this.edges.get(eid);
      if (e) out.push(e);
    }
    return out;
  }

  /** Ближайшая точка на дорогах в радиусе maxDist. */
  nearest(x: number, z: number, maxDist: number, filter?: (e: RoadEdge) => boolean): NearestHit | null {
    let best: NearestHit | null = null;
    for (const e of this.edgesNear(x, z, maxDist)) {
      if (filter && !filter(e)) continue;
      const pr = projectOnPolyline(e.pts, e.cum, { x, z });
      if (pr.d <= maxDist && (!best || pr.d < best.d)) best = { ...pr, edge: e };
    }
    return best;
  }

  nearestNode(x: number, z: number, maxDist: number): RoadNode | null {
    let best: RoadNode | null = null;
    let bd = maxDist;
    for (const e of this.edgesNear(x, z, maxDist)) {
      for (const nid of [e.a, e.b]) {
        const n = this.nodes.get(nid)!;
        const d = Math.hypot(n.x - x, n.z - z);
        if (d <= bd) {
          bd = d;
          best = n;
        }
      }
    }
    return best;
  }

  /** Расстояние от точки до ближайшей дороги за вычетом её полуширины (отрицательно — внутри дороги). */
  clearance(x: number, z: number, maxDist: number): number {
    let best = Infinity;
    for (const e of this.edgesNear(x, z, maxDist + 20)) {
      let d = Infinity;
      for (let i = 0; i < e.pts.length - 1; i++) d = Math.min(d, pointSeg({ x, z }, e.pts[i], e.pts[i + 1]).d);
      best = Math.min(best, d - e.hw);
    }
    return best;
  }

  pointAt(e: RoadEdge, s: number): PolyPoint {
    return pointAtLength(e.pts, e.cum, s);
  }

  /** Номера связных компонент по узлам. */
  components(): { node: Map<number, number>; count: number } {
    const node = new Map<number, number>();
    let count = 0;
    for (const start of this.nodes.keys()) {
      if (node.has(start)) continue;
      const stack = [start];
      node.set(start, count);
      while (stack.length) {
        const n = this.nodes.get(stack.pop()!)!;
        for (const eid of n.edges) {
          const e = this.edges.get(eid)!;
          const other = e.a === n.id ? e.b : e.a;
          if (!node.has(other)) {
            node.set(other, count);
            stack.push(other);
          }
        }
      }
      count++;
    }
    return { node, count };
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this._hash.clear();
    this.version++;
  }
}
