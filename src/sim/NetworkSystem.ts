import type { Game } from '../core/Game';
import type { System } from '../core/System';
import { CELL } from '../world/World';

declare module '../core/Game' {
  interface SystemMap {
    network: NetworkSystem;
  }
}

/**
 * Дорожная сеть: компоненты связности, подключение зданий и поиск пути (A*).
 * Компонента связности также служит «сетью» для электричества и воды.
 */
export class NetworkSystem implements System {
  readonly id = 'network';
  readonly order = 10;
  comp = new Int32Array(0);
  compCount = 0;
  /** растёт при каждой пересборке сети */
  version = 0;
  /** текущая загрузка клеток дорог (выставляет TrafficSystem) для учёта пробок */
  occupancy: Uint16Array | null = null;

  private _game!: Game;
  private _dirty = true;
  private _speed = new Float32Array(0);
  private _cap = new Float32Array(0);
  private _g = new Float32Array(0);
  private _came = new Int32Array(0);
  private _stamp = new Uint32Array(0);
  private _run = 0;
  private _heapI = new Int32Array(0);
  private _heapF = new Float32Array(0);
  private _hs = 0;
  private _maxSpeed = 1;

  init(game: Game): void {
    this._game = game;
    const n = game.world.cells;
    this.comp = new Int32Array(n).fill(-1);
    this._g = new Float32Array(n);
    this._came = new Int32Array(n);
    this._stamp = new Uint32Array(n);
    this._heapI = new Int32Array(n * 6);
    this._heapF = new Float32Array(n * 6);
    const types = game.roadTypes.all();
    this._speed = new Float32Array(types.length + 1);
    this._cap = new Float32Array(types.length + 1);
    types.forEach((t, i) => {
      this._speed[i + 1] = t.speed;
      this._cap[i + 1] = t.capacity;
      this._maxSpeed = Math.max(this._maxSpeed, t.speed);
    });
    game.bus.on('roads:changed', () => (this._dirty = true));
    game.bus.on('building:added', (b) => {
      b.access = game.builder.findAccess(b.x, b.y, b.w, b.h);
      b.comp = b.access >= 0 ? this.comp[b.access] : -1;
    });
  }

  update(): void {
    if (this._dirty) this.rebuild();
  }

  rebuild(): void {
    this._dirty = false;
    const w = this._game.world;
    const n = w.size;
    this.comp.fill(-1);
    let count = 0;
    const stack: number[] = [];
    for (let s = 0; s < w.cells; s++) {
      if (!w.road[s] || this.comp[s] >= 0) continue;
      this.comp[s] = count;
      stack.push(s);
      while (stack.length) {
        const c = stack.pop()!;
        const x = c % n;
        const y = (c / n) | 0;
        if (x > 0) this._visit(c - 1, count, stack);
        if (x < n - 1) this._visit(c + 1, count, stack);
        if (y > 0) this._visit(c - n, count, stack);
        if (y < n - 1) this._visit(c + n, count, stack);
      }
      count++;
    }
    this.compCount = count;
    for (const b of w.list()) {
      b.access = this._game.builder.findAccess(b.x, b.y, b.w, b.h);
      b.comp = b.access >= 0 ? this.comp[b.access] : -1;
    }
    this.version++;
  }

  private _visit(c: number, id: number, stack: number[]): void {
    if (this._game.world.road[c] && this.comp[c] < 0) {
      this.comp[c] = id;
      stack.push(c);
    }
  }

  /** Время проезда клетки с учётом загруженности. */
  stepCost(c: number): number {
    const r = this._game.world.road[c];
    let sp = this._speed[r];
    const occ = this.occupancy;
    if (occ) {
      const k = occ[c] / this._cap[r];
      sp /= 1 + k * k * 2.2;
    }
    return CELL / sp;
  }

  /** A* по клеткам дорог. Возвращает индексы клеток от `from` до `to` включительно. */
  findPath(from: number, to: number): number[] | null {
    const w = this._game.world;
    const n = w.size;
    if (from < 0 || to < 0 || !w.road[from] || !w.road[to]) return null;
    if (this.comp[from] !== this.comp[to]) return null;
    if (from === to) return [from];
    const run = ++this._run;
    const tx = to % n;
    const ty = (to / n) | 0;
    const hk = CELL / this._maxSpeed;
    const g = this._g;
    const came = this._came;
    const stamp = this._stamp;
    this._hs = 0;
    g[from] = 0;
    stamp[from] = run;
    came[from] = -1;
    this._push(from, 0);
    const closed = new Set<number>();
    while (this._hs > 0) {
      const cur = this._heapI[0];
      this._pop();
      if (cur === to) {
        const path: number[] = [];
        for (let c = to; c >= 0; c = came[c]) path.push(c);
        return path.reverse();
      }
      if (closed.has(cur)) continue;
      closed.add(cur);
      const x = cur % n;
      const y = (cur / n) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const nb = ny * n + nx;
        if (!w.road[nb]) continue;
        const ng = g[cur] + this.stepCost(nb);
        if (stamp[nb] !== run || ng < g[nb]) {
          stamp[nb] = run;
          g[nb] = ng;
          came[nb] = cur;
          this._push(nb, ng + (Math.abs(nx - tx) + Math.abs(ny - ty)) * hk);
        }
      }
    }
    return null;
  }

  private _push(i: number, f: number): void {
    let k = this._hs++;
    const hi = this._heapI;
    const hf = this._heapF;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p] <= f) break;
      hi[k] = hi[p];
      hf[k] = hf[p];
      k = p;
    }
    hi[k] = i;
    hf[k] = f;
  }

  private _pop(): void {
    const hi = this._heapI;
    const hf = this._heapF;
    const last = --this._hs;
    if (last <= 0) return;
    const i = hi[last];
    const f = hf[last];
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= last) break;
      if (c + 1 < last && hf[c + 1] < hf[c]) c++;
      if (hf[c] >= f) break;
      hi[k] = hi[c];
      hf[k] = hf[c];
      k = c;
    }
    hi[k] = i;
    hf[k] = f;
  }
}
