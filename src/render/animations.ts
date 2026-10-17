import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, SphereGeometry, type Scene } from 'three';
import type { Game } from '../core/Game';
import type { Building } from '../core/types';
import { installedUpgrades } from '../data/services';
import type { View } from './View';

/** Анимированная деталь здания: объект в локальных координатах здания и функция обновления. */
interface Part {
  obj: Object3D;
  tick(t: number, dt: number): void;
}

type PartFactory = (b: Building, game: Game) => Part[];

const SMOKE_MAT = new MeshBasicMaterial({ color: 0x8d9298, transparent: true, depthWrite: false });
const SMOKE_GEO = new SphereGeometry(1, 7, 5);
const WHITE_MAT = new MeshLambertMaterial({ color: 0xffffff });
const BLADE_GEO = new BoxGeometry(0.2, 6.2, 0.55).translate(0, 3.1, 0);

/** Столб дыма: несколько «клубов» циклически поднимаются, растут и бледнеют. */
function smoke(x: number, y: number, z: number, strength: number): Part {
  const g = new Group();
  g.position.set(x, y, z);
  const puffs: Mesh[] = [];
  const n = Math.max(2, Math.round(6 * strength));
  for (let i = 0; i < n; i++) {
    const m = new Mesh(SMOKE_GEO, SMOKE_MAT.clone());
    puffs.push(m);
    g.add(m);
  }
  return {
    obj: g,
    tick(t) {
      puffs.forEach((m, i) => {
        const k = (t * 0.16 + i / n) % 1;
        m.position.set(k * 4, k * 11, k * 1.5);
        m.scale.setScalar(0.5 + k * 2.4 * Math.max(0.5, strength));
        (m.material as MeshBasicMaterial).opacity = (1 - k) * 0.55 * Math.min(1, strength + 0.2);
      });
    },
  };
}

/** Мигалка: два огня по очереди (красный/синий). */
function beacon(x: number, y: number, z: number, a = 0xff2a2a, b = 0x2a5cff): Part {
  const g = new Group();
  g.position.set(x, y, z);
  const ma = new MeshBasicMaterial({ color: a, transparent: true });
  const mb = new MeshBasicMaterial({ color: b, transparent: true });
  const la = new Mesh(new BoxGeometry(0.7, 0.45, 0.7), ma);
  const lb = new Mesh(new BoxGeometry(0.7, 0.45, 0.7), mb);
  la.position.x = -0.5;
  lb.position.x = 0.5;
  g.add(la, lb);
  return {
    obj: g,
    tick(t) {
      const on = Math.floor(t * 4) % 2 === 0;
      ma.opacity = on ? 1 : 0.15;
      mb.opacity = on ? 0.15 : 1;
    },
  };
}

function rotor(x: number, y: number, z: number, speed: number, scale = 1): Part {
  const g = new Group();
  g.position.set(x, y, z);
  g.scale.setScalar(scale);
  const hub = new Group();
  for (let k = 0; k < 3; k++) {
    const blade = new Mesh(BLADE_GEO, WHITE_MAT);
    blade.rotation.x = (k * Math.PI * 2) / 3;
    hub.add(blade);
  }
  g.add(hub);
  return {
    obj: g,
    tick(_t, dt) {
      hub.rotation.x += dt * speed;
    },
  };
}

/** Фонтан: струи-капли по параболам. */
function fountain(x: number, y: number, z: number, scale = 1): Part {
  const g = new Group();
  g.position.set(x, y, z);
  g.scale.setScalar(scale);
  const mat = new MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.8 });
  const drops: Mesh[] = [];
  const geo = new SphereGeometry(0.16, 5, 4);
  for (let i = 0; i < 18; i++) {
    const m = new Mesh(geo, mat);
    drops.push(m);
    g.add(m);
  }
  return {
    obj: g,
    tick(t) {
      drops.forEach((m, i) => {
        const a = (i % 6) * 1.0472;
        const k = (t * 0.9 + (i / drops.length) * 3) % 1;
        const r = 1.2 * Math.sin(k * Math.PI) * (0.5 + (i % 3) * 0.3);
        m.position.set(Math.cos(a) * r, 3.2 * Math.sin(k * Math.PI) ** 0.8, Math.sin(a) * r);
      });
    },
  };
}

/** Чайки кружат над свалкой. */
function gulls(y: number): Part {
  const g = new Group();
  g.position.y = y;
  const mat = new MeshBasicMaterial({ color: 0xf6f6f6 });
  const geo = new BoxGeometry(1.1, 0.08, 0.35);
  const birds: Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const m = new Mesh(geo, mat);
    birds.push(m);
    g.add(m);
  }
  return {
    obj: g,
    tick(t) {
      birds.forEach((m, i) => {
        const a = t * (0.5 + i * 0.05) + i * 1.3;
        const r = 9 + i * 1.4;
        m.position.set(Math.cos(a) * r, Math.sin(t * 1.7 + i) * 1.2, Math.sin(a) * r);
        m.rotation.y = -a;
        m.rotation.z = Math.sin(t * 9 + i * 2) * 0.5;
      });
    },
  };
}

function spinner(x: number, y: number, z: number, color: number): Part {
  const m = new Mesh(new BoxGeometry(1.1, 1.1, 1.1), new MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  return { obj: m, tick: (_t, dt) => (m.rotation.y += dt * 1.6) };
}

function flag(x: number, y: number, z: number, color: number): Part {
  const m = new Mesh(new BoxGeometry(1.6, 1, 0.1), new MeshBasicMaterial({ color }));
  m.position.set(x, y, z);
  return { obj: m, tick: (t) => (m.rotation.y = Math.sin(t * 3) * 0.35) };
}

const has = (game: Game, b: Building, id: string): boolean => installedUpgrades(game.services.require(b.defId), b.up).some((u) => u.id === id);

/** Анимации по ключу модели; добавить новую — зарегистрировать фабрику. */
export const animations = new Map<string, PartFactory>();
animations.set('wind', (b, g) => {
  const parts = [rotor(1.3, 15, 0, 3.2 * (has(g, b, 'rotor') ? 1.4 : 1), has(g, b, 'rotor') ? 1.2 : 1)];
  if (has(g, b, 'tower')) parts.push(rotor(-3.1, 11, 1, 3.6, 0.8));
  return parts;
});
animations.set('coal', (b, g) => {
  const k = has(g, b, 'scrubbers') ? 0.5 : 1;
  return [smoke(6, 24.4, -7, k), smoke(9, 20.4, -3, k)];
});
animations.set('gas', (b, g) => [smoke(-4.8, 13.4, -4.6, has(g, b, 'recovery') ? 0.4 : 0.8)]);
animations.set('incinerator', (b, g) => [smoke(2.4, 19.6, -4, has(g, b, 'filters') ? 0.35 : 1)]);
animations.set('crematorium', (b, g) => [smoke(2.6, 10.6, -1.6, has(g, b, 'filter') ? 0.3 : 0.7)]);
animations.set('police', () => [beacon(0, 5.5, 0)]);
animations.set('policehq', () => [beacon(0, 7.4, -2)]);
animations.set('fire', () => [beacon(0, 5.1, 0.3, 0xff2a2a, 0xffb02a)]);
animations.set('firehq', () => [beacon(0, 6.2, -2.2, 0xff2a2a, 0xffb02a), beacon(5, 12.6, -5, 0xff2a2a, 0xffffff)]);
animations.set('hospital', () => [beacon(3.5, 9.9, -2.4, 0xff3030, 0xffffff)]);
animations.set('bigpark', (b, g) => [fountain(0, 2.8, 0, has(g, b, 'pavilion') ? 1 : 1.1)]);
animations.set('plaza', () => [fountain(0, 1.7, 0, 0.9)]);
animations.set('landfill', () => [gulls(9)]);
animations.set('recycling', () => [spinner(5.6, 7.6, -3.4, 0x2f9f5f)]);
animations.set('school', () => [flag(6, 8.2, 5, 0xd33a3a)]);

/** Анимированные детали специальных зданий: дым, лопасти, мигалки, фонтаны, чайки. */
export class AnimatedBuildingsView implements View {
  private _groups = new Map<number, { g: Group; parts: Part[] }>();
  private _t = 0;

  constructor(private _scene: Scene, private _game: Game) {
    _game.bus.on('building:added', (b) => this._add(b));
    _game.bus.on('building:removed', (b) => this._remove(b.id));
    _game.bus.on('building:updated', (b) => {
      this._remove(b.id);
      this._add(b);
    });
    for (const b of _game.world.list()) this._add(b);
  }

  private _add(b: Building): void {
    if (b.kind !== 'service' || b.abandoned) return;
    const make = animations.get(this._game.services.require(b.defId).model);
    if (!make) return;
    const parts = make(b, this._game);
    const g = new Group();
    g.position.set(b.x, 0.12, b.z);
    g.rotation.y = b.rot;
    for (const p of parts) g.add(p.obj);
    this._scene.add(g);
    this._groups.set(b.id, { g, parts });
  }

  private _remove(id: number): void {
    const e = this._groups.get(id);
    if (!e) return;
    this._scene.remove(e.g);
    this._groups.delete(id);
  }

  update(realDt: number, simDt: number): void {
    this._t += realDt;
    const w = this._game.world;
    for (const [id, e] of this._groups) {
      const b = w.buildings.get(id);
      // без электричества здания не работают: мигалки и дым гаснут, ветряк крутится всегда
      const powered = !b || b.powered || this._game.services.require(b.defId).powerNeed === 0;
      e.g.visible = true;
      for (const p of e.parts) p.tick(this._t, powered ? realDt : 0);
      void simDt;
    }
  }
}
