import { BoxGeometry, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial, Quaternion, Vector3, type Scene } from 'three';
import type { Game } from '../core/Game';
import { GeomBuilder } from './GeomBuilder';
import type { View } from './View';

const MAX = 1200;
const COLORS = { green: 0x35e06a, yellow: 0xffc933, red: 0xff3b30 };

interface Arm {
  node: number;
  edge: number;
}

/** Столбы светофоров на подходах к перекрёсткам и сигналы (цвет берётся из TrafficSystem.signal). */
export class TrafficLightView implements View {
  private _poles: InstancedMesh;
  private _lamps: InstancedMesh;
  private _arms: Arm[] = [];
  private _version = -1;
  private _timer = 0;
  private _col = new Color();

  constructor(scene: Scene, private _game: Game) {
    const pole = new GeomBuilder().cylinder(0.12, 0.14, 4.6, 0, 0, 0, 0x4a4f55, 6).box(0.5, 1.5, 0.5, 0, 4.1, 0, 0x24282c).build();
    this._poles = new InstancedMesh(pole, new MeshLambertMaterial({ vertexColors: true }), MAX);
    this._lamps = new InstancedMesh(new BoxGeometry(0.34, 0.34, 0.34), new MeshBasicMaterial({ toneMapped: false }), MAX);
    this._lamps.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
    for (const m of [this._poles, this._lamps]) {
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
    this._poles.castShadow = true;
  }

  private _rebuild(): void {
    const g = this._game;
    const graph = g.world.graph;
    this._arms = [];
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    let k = 0;
    for (const n of graph.nodes.values()) {
      if (!n.light) continue;
      let hwMax = 0;
      for (const id of n.edges) hwMax = Math.max(hwMax, graph.edges.get(id)?.hw ?? 0);
      for (const id of n.edges) {
        if (k >= MAX) break;
        const e = graph.edges.get(id);
        if (!e || e.pts.length < 2) continue;
        const p = graph.pointAt(e, e.a === n.id ? hwMax + 2 : e.len - hwMax - 2);
        // направление на перекрёсток
        let dx = n.x - p.x;
        let dz = n.z - p.z;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l;
        dz /= l;
        const off = e.hw + 0.7;
        const x = p.x + -dz * off;
        const z = p.z + dx * off;
        const y = g.world.heightAt(x, z) + 0.1;
        this._poles.setMatrixAt(k, m.compose(new Vector3(x, y, z), q.setFromAxisAngle(up, Math.atan2(dx, dz)), new Vector3(1, 1, 1)));
        this._lamps.setMatrixAt(k, m.compose(new Vector3(x + dx * 0.3, y + 4.2, z + dz * 0.3), q.identity(), new Vector3(1, 1, 1)));
        this._arms.push({ node: n.id, edge: id });
        k++;
      }
    }
    this._poles.count = this._lamps.count = k;
    this._poles.instanceMatrix.needsUpdate = this._lamps.instanceMatrix.needsUpdate = true;
    if (this._poles.instanceColor) this._poles.instanceColor.needsUpdate = true;
  }

  update(realDt: number): void {
    const graph = this._game.world.graph;
    if (graph.version !== this._version) {
      this._version = graph.version;
      this._rebuild();
      this._timer = 99;
    }
    this._timer += realDt;
    if (this._timer < 0.2 || !this._arms.length) return;
    this._timer = 0;
    const tr = this._game.get('traffic');
    this._arms.forEach((a, i) => this._lamps.setColorAt(i, this._col.setHex(COLORS[tr.signal(a.node, a.edge)])));
    this._lamps.instanceColor!.needsUpdate = true;
  }
}
