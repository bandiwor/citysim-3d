import { keys } from '../ui/keybinds';
import { graphics } from './graphics';
import { MathUtils, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { CELL } from '../config/constants';
import type { GameConfig } from '../config/gameConfig';

/** RTS-камера: панорамирование (WASD / средняя кнопка / ЛКМ с инструментом «Выбор»), вращение (ПКМ / Q,E), масштаб (колесо). */
export class CameraController {
  readonly camera: PerspectiveCamera;
  target = new Vector3();
  yaw = Math.PI * 0.25;
  pitch = 0.9;
  distance = 190;
  /** камерой управляет другой контроллер (первое лицо / следование) */
  external = false;
  private _follow: (() => { x: number; z: number } | null) | null = null;
  private _saved: { target: Vector3; yaw: number; pitch: number; distance: number; fov: number; near: number } | null = null;
  private _goal = { target: new Vector3(), yaw: 0, pitch: 0, distance: 0 };
  private _keys = new Set<string>();
  private _plane = new Plane(new Vector3(0, 1, 0), 0);
  private _ray = new Raycaster();
  private _v = new Vector3();
  private _bounds: number;

  constructor(private _el: HTMLElement, mapSize: number, private _cfg: GameConfig['camera']) {
    this._bounds = mapSize * CELL;
    this.distance = _cfg.startDistance;
    this.camera = new PerspectiveCamera(_cfg.fov, 1, 2, 2600);
    this.target.set(this._bounds / 2, 0, this._bounds / 2);
    this._goal.target.copy(this.target);
    this._goal.yaw = this.yaw;
    this._goal.pitch = this.pitch;
    this._goal.distance = this.distance;
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      this._keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this._keys.delete(e.code));
    window.addEventListener('blur', () => this._keys.clear());
    _el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const step = Math.pow(this._cfg.zoomStep, graphics.get().zoomSpeed);
        this.zoom(e.deltaY > 0 ? step : 1 / step);
      },
      { passive: false },
    );
  }

  zoom(f: number): void {
    this._goal.distance = MathUtils.clamp(this._goal.distance * f, this._cfg.minDistance, this._cfg.maxDistance);
  }

  rotate(dYaw: number, dPitch: number): void {
    this._goal.yaw += dYaw;
    this._goal.pitch = MathUtils.clamp(this._goal.pitch + dPitch, 0.25, 1.4);
  }

  /** Сдвиг по экрану в пикселях → по земле. */
  panPixels(dx: number, dy: number): void {
    this._follow = null;
    const k = (this.distance / this._el.clientHeight) * 1.25;
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    this._goal.target.x -= (dx * cy + dy * sy * 1.2) * k;
    this._goal.target.z -= (-dx * sy + dy * cy * 1.2) * k;
    this._clampGoal();
  }

  /** Камера плавно следует за точкой, пока не будет сдвинута вручную (null — прекратить). */
  follow(fn: (() => { x: number; z: number } | null) | null): void {
    this._follow = fn;
  }

  get following(): boolean {
    return !!this._follow;
  }

  /** Запомнить обзорную камеру и отдать управление (первое лицо). */
  detach(): void {
    this._saved = { target: this.target.clone(), yaw: this._goal.yaw, pitch: this._goal.pitch, distance: this._goal.distance, fov: this.camera.fov, near: this.camera.near };
    this.external = true;
    this._follow = null;
  }

  /** Вернуть обзорную камеру к сохранённому виду, но над точкой (x, z). */
  attach(x: number, z: number): void {
    const s = this._saved;
    this.external = false;
    if (!s) return;
    this.camera.fov = s.fov;
    this.camera.near = s.near;
    this.camera.updateProjectionMatrix();
    this._goal.target.set(x, 0, z);
    this._clampGoal();
    this.target.copy(this._goal.target);
    this._goal.yaw = this.yaw = s.yaw;
    this._goal.pitch = this.pitch = s.pitch;
    this._goal.distance = this.distance = Math.min(s.distance, 160);
    this._saved = null;
  }

  focus(x: number, z: number): void {
    this._goal.target.set(x, 0, z);
    this._clampGoal();
  }

  private _clampGoal(): void {
    this._goal.target.x = MathUtils.clamp(this._goal.target.x, 0, this._bounds);
    this._goal.target.z = MathUtils.clamp(this._goal.target.z, 0, this._bounds);
  }

  update(dt: number): void {
    if (this.external) return;
    const g = this._goal;
    if (this._follow) {
      const f = this._follow();
      if (f) {
        g.target.set(f.x, 0, f.z);
        this._clampGoal();
      } else this._follow = null;
    }
    const k = this._keys;
    const speed = this.distance * this._cfg.panSpeed * graphics.get().panSpeed * dt;
    let fx = 0;
    let fz = 0;
    if (k.has(keys.code('panUp')) || k.has('ArrowUp')) fz -= 1;
    if (k.has(keys.code('panDown')) || k.has('ArrowDown')) fz += 1;
    if (k.has(keys.code('panLeft')) || k.has('ArrowLeft')) fx -= 1;
    if (k.has(keys.code('panRight')) || k.has('ArrowRight')) fx += 1;
    if (fx || fz) {
      this._follow = null;
      const sy = Math.sin(g.yaw);
      const cy = Math.cos(g.yaw);
      g.target.x += (fx * cy + fz * sy) * speed;
      g.target.z += (-fx * sy + fz * cy) * speed;
      this._clampGoal();
    }
    if (k.has(keys.code('rotateLeft'))) g.yaw -= dt * this._cfg.rotateSpeed * graphics.get().rotateSpeed;
    if (k.has(keys.code('rotateRight'))) g.yaw += dt * this._cfg.rotateSpeed * graphics.get().rotateSpeed;
    if (k.has(keys.code('tiltUp'))) g.pitch = Math.min(1.4, g.pitch + dt);
    if (k.has(keys.code('tiltDown'))) g.pitch = Math.max(0.25, g.pitch - dt);
    if (k.has(keys.code('zoomIn')) || k.has('NumpadAdd')) this.zoom(1 - dt * 1.5);
    if (k.has(keys.code('zoomOut')) || k.has('NumpadSubtract')) this.zoom(1 + dt * 1.5);

    const t = 1 - Math.exp(-dt * this._cfg.smoothing);
    this.target.lerp(g.target, t);
    this.yaw += (g.yaw - this.yaw) * t;
    this.pitch += (g.pitch - this.pitch) * t;
    this.distance += (g.distance - this.distance) * t;

    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    this.camera.lookAt(this.target);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Точка на плоскости земли под курсором (в пикселях относительно элемента). */
  groundAt(px: number, py: number): Vector3 | null {
    const r = this._el.getBoundingClientRect();
    const ndc = new Vector2(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(ndc, this.camera);
    return this._ray.ray.intersectPlane(this._plane, this._v) ? this._v.clone() : null;
  }
}
