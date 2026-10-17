import { Euler, MathUtils } from 'three';
import type { Game } from '../core/Game';
import { obbDist } from '../world/geometry';
import { Terrain } from '../world/Terrain';
import type { Renderer } from './Renderer';

const BRIDGE_LIFT = 0.3;

/** Режим от первого лица: ходьба по городу (WASD, Shift — бег, мышь — обзор) с коллизиями со зданиями и водой. */
export class FirstPerson {
  active = false;
  x = 0;
  z = 0;
  yaw = 0;
  pitch = 0;
  y = 0;
  private _keys = new Set<string>();
  private _eul = new Euler(0, 0, 0, 'YXZ');
  private _stepDist = 0;
  private _drag = false;
  private _locked = false;
  onChange: (active: boolean) => void = () => {};

  constructor(private _game: Game, private _renderer: Renderer, private _canvas: HTMLCanvasElement, private _setLocked: (v: boolean) => void) {
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      this._keys.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyP') this.exit();
    });
    window.addEventListener('keyup', (e) => this._keys.delete(e.code));
    window.addEventListener('blur', () => this._keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      if (this._locked || this._drag) this._look(e.movementX, e.movementY);
    });
    _canvas.addEventListener('pointerdown', () => {
      if (!this.active) return;
      this._drag = true;
      if (!this._locked) void this._requestLock();
    });
    window.addEventListener('pointerup', () => (this._drag = false));
    document.addEventListener('pointerlockchange', () => {
      const was = this._locked;
      this._locked = document.pointerLockElement === this._canvas;
      if (was && !this._locked && this.active) this.exit();
    });
    _game.bus.on('fp:enter', (p) => this.enter(p.x, p.z));
  }

  private async _requestLock(): Promise<void> {
    try {
      await (this._canvas.requestPointerLock() as unknown as Promise<void> | undefined);
    } catch {
      /* перетаскивание мышью работает без захвата курсора */
    }
  }

  private _look(dx: number, dy: number): void {
    const s = this._game.config.fp.sensitivity;
    this.yaw -= dx * s;
    this.pitch = MathUtils.clamp(this.pitch - dy * s, -1.45, 1.45);
  }

  /** Войти в режим: игрок встаёт на ближайший тротуар к точке. */
  enter(x: number, z: number): void {
    if (this.active) return;
    const g = this._game;
    const hit = g.world.graph.nearest(x, z, 60, (e) => !e.bridge);
    this.x = x;
    this.z = z;
    if (hit) {
      const t = g.roadTypes.at(hit.edge.type);
      const off = hit.edge.hw - Math.max(0.5, t.sidewalk * 0.5);
      this.x = hit.x + -hit.tz * off;
      this.z = hit.z + hit.tx * off;
      this.yaw = Math.atan2(-hit.tx, -hit.tz);
    } else this.yaw = this._renderer.camera.yaw + Math.PI;
    if (!this._canMove(this.x, this.z)) {
      this.x = x;
      this.z = z;
    }
    this.pitch = 0;
    this.active = true;
    this._renderer.camera.detach();
    const cam = this._renderer.camera.camera;
    cam.fov = g.config.fp.fov;
    cam.near = 0.1;
    cam.updateProjectionMatrix();
    this._setLocked(true);
    this.y = this._ground(this.x, this.z);
    void this._requestLock();
    this._keys.clear();
    this.onChange(true);
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this._drag = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this._renderer.camera.attach(this.x, this.z);
    this._renderer.pedestrians.focusOverride = null;
    this._setLocked(false);
    this._game.bus.emit('fp:exit');
    this.onChange(false);
  }

  private _ground(x: number, z: number): number {
    const g = this._game.world;
    const hit = g.graph.nearest(x, z, 24, (e) => e.bridge);
    if (hit && hit.d <= hit.edge.hw) return BRIDGE_LIFT + 0.1;
    return Math.max(0.1, g.heightAt(x, z));
  }

  /** Можно ли стоять в точке: не вода (кроме мостов), не внутри здания. */
  private _canMove(x: number, z: number): boolean {
    const w = this._game.world;
    const r = this._game.config.fp.radius;
    if (x < 2 || z < 2 || x > w.extent - 2 || z > w.extent - 2) return false;
    const onBridge = this._ground(x, z) > 0.3;
    if (!onBridge && w.terrainAt(x, z) === Terrain.Water) return false;
    for (const b of w.buildingsNear(x, z, 8)) if (obbDist(w.obbOf(b), { x, z }) < r) return false;
    return true;
  }

  update(dt: number): void {
    if (!this.active) return;
    const c = this._game.config.fp;
    const k = this._keys;
    let f = 0;
    let s = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
    if (k.has('KeyQ')) this.yaw += dt * 1.6;
    if (k.has('KeyE')) this.yaw -= dt * 1.6;
    if (f || s) {
      const len = Math.hypot(f, s);
      const sp = (k.has('ShiftLeft') || k.has('ShiftRight') ? c.run : c.walk) * dt;
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const dx = ((fx * f + -fz * s) / len) * sp;
      const dz = ((fz * f + fx * s) / len) * sp;
      const ox = this.x;
      const oz = this.z;
      if (this._canMove(this.x + dx, this.z + dz)) {
        this.x += dx;
        this.z += dz;
      } else if (this._canMove(this.x + dx, this.z)) this.x += dx;
      else if (this._canMove(this.x, this.z + dz)) this.z += dz;
      this._stepDist += Math.hypot(this.x - ox, this.z - oz);
      if (this._stepDist > 2.1) {
        this._stepDist = 0;
        this._game.sfx('step');
      }
    }
    const gy = this._ground(this.x, this.z);
    this.y += (gy - this.y) * Math.min(1, dt * 10);
    const bob = f || s ? Math.sin(performance.now() / 120) * 0.04 : 0;
    const cam = this._renderer.camera.camera;
    cam.position.set(this.x, this.y + c.eyeHeight + bob, this.z);
    cam.quaternion.setFromEuler(this._eul.set(this.pitch, this.yaw, 0));
    // тени, звук и пешеходы следуют за игроком
    this._renderer.camera.target.set(this.x, 0, this.z);
    this._renderer.camera.distance = 22;
    this._renderer.pedestrians.focusOverride = { x: this.x, z: this.z };
  }
}
