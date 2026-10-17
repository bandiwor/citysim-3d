import type { GraphSnapshot, PathRequest, PathResult } from './protocol';

/**
 * Поиск пути A* по графу дорог (мульти-старт/мульти-финиш: точки начала и конца лежат на рёбрах).
 * Время проезда ребра = длина / (скорость · поправка на загруженность).
 */
export class PathFinder {
  private _g: GraphSnapshot | null = null;
  private _occ: Float32Array = new Float32Array(0);
  private _adjStart = new Int32Array(0);
  private _adj = new Int32Array(0);
  private _dist = new Float64Array(0);
  private _prevEdge = new Int32Array(0);
  private _prevDir = new Int8Array(0);
  private _prevNode = new Int32Array(0);
  private _stamp = new Uint32Array(0);
  private _run = 0;
  private _maxSpeed = 1;
  private _heapN: number[] = [];
  private _heapF: number[] = [];

  get version(): number {
    return this._g?.version ?? -1;
  }

  setGraph(g: GraphSnapshot): void {
    this._g = g;
    const n = g.nodeCount;
    const counts = new Int32Array(n + 1);
    for (let e = 0; e < g.edgeCount; e++) {
      counts[g.edgeA[e] + 1]++;
      counts[g.edgeB[e] + 1]++;
    }
    for (let i = 0; i < n; i++) counts[i + 1] += counts[i];
    this._adjStart = counts;
    this._adj = new Int32Array(g.edgeCount * 2);
    const fill = counts.slice(0, n);
    for (let e = 0; e < g.edgeCount; e++) {
      this._adj[fill[g.edgeA[e]]++] = e;
      this._adj[fill[g.edgeB[e]]++] = e;
    }
    this._dist = new Float64Array(n);
    this._prevEdge = new Int32Array(n);
    this._prevDir = new Int8Array(n);
    this._prevNode = new Int32Array(n);
    this._stamp = new Uint32Array(n);
    this._run = 0;
    this._maxSpeed = 1;
    for (let e = 0; e < g.edgeCount; e++) this._maxSpeed = Math.max(this._maxSpeed, g.edgeSpeed[e]);
    if (this._occ.length !== g.edgeCount) this._occ = new Float32Array(g.edgeCount);
  }

  setOccupancy(occ: Float32Array): void {
    this._occ = occ;
  }

  private _time(e: number, len = this._g!.edgeLen[e]): number {
    const g = this._g!;
    const k = (this._occ[e] ?? 0) / g.edgeCap[e];
    return len / (g.edgeSpeed[e] * Math.max(g.minFlow, 1 / (1 + k ** 2 * g.congestionPower)));
  }

  find(req: PathRequest): PathResult {
    const fail: PathResult = { id: req.id, version: req.version, ok: false, steps: [] };
    const g = this._g;
    if (!g || g.version !== req.version) return fail;
    const { fromEdge, toEdge } = req;
    if (fromEdge < 0 || toEdge < 0 || fromEdge >= g.edgeCount || toEdge >= g.edgeCount) return fail;
    if (fromEdge === toEdge) {
      const dir = req.toS >= req.fromS ? 1 : -1;
      return { id: req.id, version: req.version, ok: true, steps: [(fromEdge + 1) * dir] };
    }

    const run = ++this._run;
    const dist = this._dist;
    const stamp = this._stamp;
    this._heapN.length = 0;
    this._heapF.length = 0;

    const tA = g.edgeA[toEdge];
    const tB = g.edgeB[toEdge];
    const costToA = this._time(toEdge, req.toS);
    const costToB = this._time(toEdge, g.edgeLen[toEdge] - req.toS);
    const gx = (g.nodeX[tA] + g.nodeX[tB]) / 2;
    const gz = (g.nodeZ[tA] + g.nodeZ[tB]) / 2;
    const h = (n: number): number => Math.max(0, Math.hypot(g.nodeX[n] - gx, g.nodeZ[n] - gz) - g.edgeLen[toEdge] / 2) / this._maxSpeed;

    const seed = (node: number, cost: number, dir: number): void => {
      if (stamp[node] === run && dist[node] <= cost) return;
      stamp[node] = run;
      dist[node] = cost;
      this._prevEdge[node] = fromEdge;
      this._prevDir[node] = dir;
      this._prevNode[node] = -1;
      this._push(node, cost + h(node));
    };
    seed(g.edgeA[fromEdge], this._time(fromEdge, req.fromS), -1);
    seed(g.edgeB[fromEdge], this._time(fromEdge, g.edgeLen[fromEdge] - req.fromS), 1);

    let best = Infinity;
    let bestNode = -1;
    while (this._heapN.length) {
      const f = this._heapF[0];
      const n = this._pop();
      if (f >= best) break;
      if (n === tA || n === tB) {
        const total = dist[n] + (n === tA ? costToA : costToB);
        if (total < best) {
          best = total;
          bestNode = n;
        }
      }
      const gn = dist[n];
      for (let k = this._adjStart[n]; k < this._adjStart[n + 1]; k++) {
        const e = this._adj[k];
        const forward = g.edgeA[e] === n;
        const m = forward ? g.edgeB[e] : g.edgeA[e];
        const ng = gn + this._time(e);
        if (stamp[m] !== run || ng < dist[m]) {
          stamp[m] = run;
          dist[m] = ng;
          this._prevEdge[m] = e;
          this._prevDir[m] = forward ? 1 : -1;
          this._prevNode[m] = n;
          this._push(m, ng + h(m));
        }
      }
    }
    if (bestNode < 0) return fail;

    const steps: number[] = [];
    for (let n = bestNode; n >= 0; n = this._prevNode[n]) steps.push((this._prevEdge[n] + 1) * this._prevDir[n]);
    steps.reverse();
    steps.push((toEdge + 1) * (bestNode === tA ? 1 : -1));
    return { id: req.id, version: req.version, ok: true, steps };
  }

  private _push(n: number, f: number): void {
    const hn = this._heapN;
    const hf = this._heapF;
    let k = hn.length;
    hn.push(n);
    hf.push(f);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p] <= f) break;
      hn[k] = hn[p];
      hf[k] = hf[p];
      k = p;
    }
    hn[k] = n;
    hf[k] = f;
  }

  private _pop(): number {
    const hn = this._heapN;
    const hf = this._heapF;
    const top = hn[0];
    const ln = hn.pop()!;
    const lf = hf.pop()!;
    const size = hn.length;
    if (size > 0) {
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= size) break;
        if (c + 1 < size && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= lf) break;
        hn[k] = hn[c];
        hf[k] = hf[c];
        k = c;
      }
      hn[k] = ln;
      hf[k] = lf;
    }
    return top;
  }
}
