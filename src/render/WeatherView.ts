import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, LineSegments, NormalBlending, Points, ShaderMaterial, type Scene } from 'three';
import type { Game } from '../core/Game';
import { SNOW } from './snow';
import type { View } from './View';

const RAIN = 5000;
const FLAKES = 4000;

/** Частицы в «коробке» вокруг точки обзора: позиции задаёт шейдер по времени, CPU ничего не двигает. */
function precipitation(count: number, lines: boolean): BufferGeometry {
  const pos: number[] = [];
  const end: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.random();
    const y = Math.random();
    const z = Math.random();
    const reps = lines ? 2 : 1;
    for (let k = 0; k < reps; k++) {
      pos.push(x, y, z);
      end.push(k);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aEnd', new Float32BufferAttribute(end, 1));
  return g;
}

const VERT = `
uniform float uTime;
uniform vec3 uCenter;
uniform float uSize;
uniform float uSpeed;
uniform float uLen;
uniform vec2 uWind;
uniform float uPoint;
attribute float aEnd;
varying float vFade;
void main() {
  vec3 p = position;
  // падение и снос ветром, бесшовно по модулю «коробки»
  p.y = fract(p.y - uTime * uSpeed / uSize);
  p.x = fract(p.x + uTime * uWind.x / uSize + sin(uTime * 0.7 + position.z * 40.0) * uPoint * 0.004);
  p.z = fract(p.z + uTime * uWind.y / uSize);
  vec3 w = uCenter + vec3((p.x - 0.5) * uSize, p.y * uSize * 0.7, (p.z - 0.5) * uSize);
  w += vec3(uWind.x, -uSpeed, uWind.y) * (aEnd * uLen / uSpeed);
  vFade = smoothstep(0.0, 0.1, p.y) * (1.0 - smoothstep(0.85, 1.0, p.y));
  vec4 mv = modelViewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(7.0, uPoint * 280.0 / max(1.0, -mv.z));
}`;

/**
 * Погода на экране: дождь (штрихи), снег (хлопья), снежный покров (через SNOW в материалах).
 * Сила задаётся WeatherSystem.intensity; на низкой графике и вне погоды — ничего не рисуется.
 */
export class WeatherView implements View {
  private _rain: LineSegments;
  private _snow: Points;
  private _t = 0;
  private _uRain: Record<string, { value: unknown }>;
  private _uSnow: Record<string, { value: unknown }>;

  constructor(scene: Scene, private _game: Game, private _focus: () => { x: number; z: number; distance: number }) {
    const uniforms = (speed: number, len: number, point: number): Record<string, { value: unknown }> => ({
      uTime: { value: 0 },
      uCenter: { value: [0, 0, 0] },
      uSize: { value: 200 },
      uSpeed: { value: speed },
      uLen: { value: len },
      uWind: { value: [3, 1] },
      uPoint: { value: point },
      uOpacity: { value: 0 },
    });
    this._uRain = uniforms(38, 1.6, 0);
    this._uSnow = uniforms(4, 0, 1);
    const rainMat = new ShaderMaterial({
      uniforms: this._uRain,
      vertexShader: VERT,
      fragmentShader: 'uniform float uOpacity; varying float vFade; void main() { gl_FragColor = vec4(0.72, 0.8, 0.92, uOpacity * vFade); }',
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
    const snowMat = new ShaderMaterial({
      uniforms: this._uSnow,
      vertexShader: VERT,
      fragmentShader: 'uniform float uOpacity; varying float vFade; void main() { vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, uOpacity * vFade * (1.0 - d * 3.0)); }',
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this._rain = new LineSegments(precipitation(RAIN, true), rainMat);
    this._snow = new Points(precipitation(FLAKES, false), snowMat);
    for (const o of [this._rain, this._snow]) {
      o.frustumCulled = false;
      o.visible = false;
      o.renderOrder = 5;
      scene.add(o);
    }
  }

  update(realDt: number): void {
    const w = this._game.get('weather');
    if (!w) return;
    this._t += realDt;
    SNOW.value += (w.snow - SNOW.value) * Math.min(1, realDt * 2);
    const f = this._focus();
    const size = Math.min(420, Math.max(70, f.distance * 1.3));
    const p = w.precipitation();
    const snowing = w.kind === 'snow';
    const storm = w.kind === 'storm';
    const wind = storm ? [14, 5] : [3, 1];
    for (const [u, on, count, obj] of [
      [this._uRain, !snowing && p > 0.02, RAIN, this._rain],
      [this._uSnow, snowing && p > 0.02, FLAKES, this._snow],
    ] as const) {
      obj.visible = on;
      if (!on) continue;
      u.uTime.value = this._t;
      u.uCenter.value = [f.x, 0, f.z];
      u.uSize.value = size;
      u.uWind.value = wind;
      u.uOpacity.value = (snowing ? 0.85 : 0.45) * Math.min(1, p * 1.3);
      // частиц столько, сколько нужно по силе осадков (и меньше вдали — коробка больше)
      obj.geometry.setDrawRange(0, Math.round(count * Math.min(1, p) * (obj === this._rain ? 2 : 1)));
    }
  }
}
