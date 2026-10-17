import type { Game } from '../core/Game';
import type { System } from '../core/System';
import { Rng } from '../core/Rng';
import { lookOf } from './looks';

declare module '../core/Game' {
  interface SystemMap {
    pedestrians: PedestrianSystem;
  }
}

export interface Walker {
  edge: number;
  s: number;
  /** +1 — от начала ребра к концу */
  dir: 1 | -1;
  /** сторона тротуара ±1 */
  side: 1 | -1;
  speed: number;
  /** зерно внешности (см. looks.ts) */
  seed: number;
  x: number;
  z: number;
  yaw: number;
  phase: number;
}

/** Люди на тротуарах и у остановок. Живут только вокруг точки интереса (камера / игрок), поэтому дёшево. */
export class PedestrianSystem implements System {
  readonly id = 'pedestrians';
  readonly order = 60;
  walkers: Walker[] = [];
  /** точка вокруг которой живут пешеходы; null — пешеходов нет */
  focus: { x: number; z: number } | null = null;
  private _game!: Game;
  private _rng = new Rng(77);
  private _acc = 0;

  init(game: Game): void {
    this._game = game;
  }

  /** Желаемое число прохожих: зависит от плотности населения вокруг и от времени суток. */
  target(): number {
    const g = this._game;
    const c = g.config.pedestrians;
    const f = this.focus;
    if (!f) return 0;
    let pop = 0;
    for (const b of g.world.list()) {
      if (b.kind !== 'zone' || b.abandoned) continue;
      if (Math.abs(b.x - f.x) < c.radius && Math.abs(b.z - f.z) < c.radius) pop += b.pop;
    }
    const tod = g.get('time').tod;
    const h = tod * 24;
    const act = h < 5 || h > 23.5 ? 0.12 : h < 7 ? 0.5 : h < 20 ? 1 : 0.55;
    return Math.min(c.max, Math.round(pop * c.perResidentNear * act));
  }

  update(dt: number): void {
    const g = this._game;
    const c = g.config.pedestrians;
    const graph = g.world.graph;
    const f = this.focus;
    if (!f) {
      this.walkers.length = 0;
      return;
    }
    // уборка: далеко от фокуса или ребро пропало
    this.walkers = this.walkers.filter((w) => {
      const e = graph.edges.get(w.edge);
      return e && Math.hypot(w.x - f.x, w.z - f.z) < c.radius * 1.15;
    });
    this._acc += dt;
    if (this._acc > 0.5) {
      this._acc = 0;
      const want = this.target();
      let spawn = Math.min(Math.ceil(c.spawnPerSecond * 0.5), want - this.walkers.length);
      while (spawn-- > 0) this._spawn(f.x, f.z);
      if (this.walkers.length > want + 6) this.walkers.length = want;
    }
    for (const w of this.walkers) this._walk(w, dt);
  }

  private _spawn(fx: number, fz: number): void {
    const g = this._game;
    const c = g.config.pedestrians;
    const rng = this._rng;
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * c.radius;
    const hit = g.world.graph.nearest(fx + Math.cos(a) * r, fz + Math.sin(a) * r, 30, (e) => e.type >= 0 && g.roadTypes.at(e.type).sidewalk > 0 && !e.bridge);
    if (!hit) return;
    const e = hit.edge;
    const seed = Math.floor(rng.next() * 0x7fffffff);
    const w: Walker = {
      edge: e.id,
      s: Math.min(e.len, Math.max(0, hit.s ?? 0)),
      dir: rng.next() < 0.5 ? 1 : -1,
      side: rng.next() < 0.5 ? 1 : -1,
      speed: 0,
      seed,
      x: hit.x,
      z: hit.z,
      yaw: 0,
      phase: rng.next() * 10,
    };
    w.speed = (c.speed[0] + rng.next() * (c.speed[1] - c.speed[0])) * lookOf(seed).speed;
    this._place(w);
    this.walkers.push(w);
  }

  private _place(w: Walker): void {
    const g = this._game;
    const e = g.world.graph.edges.get(w.edge);
    if (!e) return;
    const t = g.roadTypes.at(e.type);
    const p = g.world.graph.pointAt(e, Math.min(e.len, Math.max(0, w.s)));
    const off = (e.hw - t.sidewalk * 0.5) * w.side;
    w.x = p.x + -p.tz * off;
    w.z = p.z + p.tx * off;
    w.yaw = Math.atan2(p.tx * w.dir, p.tz * w.dir);
  }

  private _walk(w: Walker, dt: number): void {
    const graph = this._game.world.graph;
    const e = graph.edges.get(w.edge);
    if (!e) return;
    w.s += w.dir * w.speed * dt;
    w.phase += dt * w.speed * 2.2;
    if (w.s > 0 && w.s < e.len) return this._place(w);
    // дошли до перекрёстка: выбрать следующее ребро
    const nodeId = w.s >= e.len ? e.b : e.a;
    const node = graph.nodes.get(nodeId);
    const options = node ? node.edges.filter((id) => id !== e.id && !graph.edges.get(id)!.bridge) : [];
    if (!options.length) {
      w.dir = (w.dir * -1) as 1 | -1;
      w.s = Math.min(e.len, Math.max(0, w.s));
      return this._place(w);
    }
    const nextId = options[Math.floor(this._rng.next() * options.length)];
    const n = graph.edges.get(nextId)!;
    w.edge = nextId;
    w.dir = n.a === nodeId ? 1 : -1;
    w.s = n.a === nodeId ? 0.1 : n.len - 0.1;
    if (this._rng.next() < 0.5) w.side = (w.side * -1) as 1 | -1;
    this._place(w);
  }

  /** Ожидающие на остановках (для отрисовки): координаты и число людей. */
  waiting(): { id: number; x: number; z: number; n: number }[] {
    const f = this.focus;
    const tr = this._game.get('transit');
    const out: { id: number; x: number; z: number; n: number }[] = [];
    if (!f) return out;
    for (const s of tr.stops) {
      if (Math.hypot(s.x - f.x, s.z - f.z) > this._game.config.pedestrians.radius) continue;
      const n = Math.min(8, Math.ceil(tr.waitingAt(s.id) / 4));
      if (n) out.push({ id: s.id, x: s.x, z: s.z, n });
    }
    return out;
  }
}
