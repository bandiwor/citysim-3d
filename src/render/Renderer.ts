import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PCFShadowMap,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Game } from '../core/Game';
import { clamp, smoothstep } from '../core/Rng';
import { AnimatedBuildingsView } from './animations';
import { AlertView } from './AlertView';
import { BuildingView } from './BuildingView';
import { ConstructionView } from './ConstructionView';
import { CameraController } from './CameraController';
import { graphics, type GraphicsSettings } from './graphics';
import { PedestrianView } from './PedestrianView';
import { PreviewView } from './PreviewView';
import { RoadView } from './RoadView';
import { RouteView } from './RouteView';
import { TrafficLightView } from './TrafficLightView';
import { TerrainView } from './TerrainView';
import { GrassView } from './GrassView';
import { PropView } from './PropView';
import { TreeView } from './TreeView';
import { VehicleView } from './VehicleView';
import type { View } from './View';
import { OverlayView, ZoneLayerView } from './ZoneLayerView';

const DAY_SKY = new Color(0x8fc4ee);
const DUSK_SKY = new Color(0xe9a070);
const DAWN_SKY = new Color(0xf4a99a);
const WARM_SUN = new Color(1, 0.52, 0.28);
const WHITE_SUN = new Color(1, 0.96, 0.88);
const NIGHT_SKY = new Color(0x0b1226);

/** Сцена, свет, смена дня/ночи, тени и список видов. */
export class Renderer {
  readonly three: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: CameraController;
  readonly preview: PreviewView;
  readonly zoneLayer: ZoneLayerView;
  readonly buildings: BuildingView;
  readonly routes: RouteView;
  readonly pedestrians: PedestrianView;
  shadows = true;
  /** ночь 0..1 для звука и освещения */
  night = 0;
  dayNight = true;
  /** деревья и растения игрока показываются */
  treesVisible = true;
  private _views: View[] = [];
  private _sun = new DirectionalLight(0xfff1d6, 2.4);
  private _hemi = new HemisphereLight(0xbfdcff, 0x5a6a4a, 0.9);
  private _amb = new AmbientLight(0x5a6ca0, 0.2);
  private _sky = new Color();
  private _fixed = 0.45;
  /** тени перерисовываются не каждый кадр: при движении камеры — сразу, иначе раз в несколько кадров */
  private _shadowKey = '';
  private _shadowSkip = 0;
  /** динамическое разрешение */
  private _dyn = 1;
  private _ema = 1 / 60;
  private _dynTimer = 0;
  private _good = 0;
  private _basePR = 1;
  /** телефон/планшет: сенсорный экран без мыши */
  private readonly _mobile = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  constructor(canvas: HTMLCanvasElement, private _game: Game) {
    this.three = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.three.outputColorSpace = SRGBColorSpace;
    this.three.toneMapping = ACESFilmicToneMapping;
    this.three.toneMappingExposure = _game.config.render.exposure;
    this.three.shadowMap.enabled = true;
    this.three.shadowMap.type = PCFShadowMap;
    this.three.shadowMap.autoUpdate = false;

    this.camera = new CameraController(canvas, _game.world.size, _game.config.camera);
    this.scene.fog = new Fog(DAY_SKY.getHex(), 300, 1500);
    this.scene.background = DAY_SKY.clone();

    this._sun.castShadow = true;
    this._sun.shadow.mapSize.set(_game.config.render.shadowSize, _game.config.render.shadowSize);
    this._sun.shadow.bias = -0.0004;
    this._sun.shadow.normalBias = 0.6;
    this.scene.add(this._sun, this._sun.target, this._hemi, this._amb);

    const terrain = new TerrainView(this.scene, _game.world, _game);
    this.buildings = new BuildingView(this.scene, _game);
    this.routes = new RouteView(this.scene, _game);
    this.pedestrians = new PedestrianView(this.scene, _game, () => ({ x: this.camera.target.x, z: this.camera.target.z, distance: this.camera.distance }));
    this.preview = new PreviewView(this.scene);
    this.zoneLayer = new ZoneLayerView(this.scene, _game);
    this._views.push(
      terrain,
      new RoadView(this.scene, _game),
      this.zoneLayer,
      new OverlayView(this.scene, _game),
      this.buildings,
      new AnimatedBuildingsView(this.scene, _game),
      new ConstructionView(this.scene, _game),
      new TreeView(this.scene, _game, () => this.camera.camera.position),
      new PropView(this.scene, _game),
      new GrassView(this.scene, _game, () => ({ x: this.camera.target.x, z: this.camera.target.z, distance: this.camera.distance })),
      new TrafficLightView(this.scene, _game),
      new VehicleView(this.scene, _game),
      this.routes,
      this.pedestrians,
      new AlertView(this.scene, _game),
    );
    window.addEventListener('resize', () => this.resize());
    this._applyGraphics(graphics.get());
    graphics.onChange((g) => this._applyGraphics(g));
    this.resize();
  }

  /** Применяет настройки графики: тени, разрешение, туман, деревья, день/ночь. */
  private _applyGraphics(g: GraphicsSettings): void {
    this.setShadows(g.shadows);
    // на телефоне карта теней не больше 2048: на маленьком экране 4096 неотличима, а стоит вчетверо больше
    const size = Math.min([1024, 2048, 4096][g.shadowQuality] ?? 2048, this._mobile ? 2048 : 4096);
    if (this._sun.shadow.mapSize.x !== size) {
      this._sun.shadow.map?.dispose();
      this._sun.shadow.map = null;
      this._sun.shadow.mapSize.set(size, size);
    }
    this._basePR = Math.min(window.devicePixelRatio, 2) * g.renderScale;
    if (!g.autoRes) this._dyn = 1;
    this.three.setPixelRatio(this._basePR * this._dyn);
    const fog = this.scene.fog as Fog;
    fog.near = g.fog ? 300 : 20000;
    fog.far = g.fog ? 1500 : 40000;
    this.dayNight = g.dayNight;
    this.treesVisible = g.trees;
    if (this._views.length) this.resize();
  }

  addView(v: View): void {
    this._views.push(v);
  }

  setShadows(on: boolean): void {
    this.shadows = on;
    this._sun.castShadow = on;
    this._shadowKey = '';
    this.three.shadowMap.needsUpdate = true;
  }

  resize(): void {
    const c = this.three.domElement;
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    this.three.setSize(w, h, false);
    this.camera.resize(w, h);
  }

  frame(realDt: number, simDt: number): void {
    this.camera.update(realDt);
    for (const v of this._views) v.update?.(realDt, simDt);
    this._light();
    this._shadowSchedule();
    this.three.render(this.scene, this.camera.camera);
    this._adaptResolution(realDt);
  }

  /** Перерисовка карты теней: сразу при движении камеры/солнца, иначе через кадр (на паузе — реже). */
  private _shadowSchedule(): void {
    if (!this.shadows) return;
    const t = this.camera.target;
    const p = this._sun.position;
    const key = `${t.x.toFixed(2)}|${t.z.toFixed(2)}|${this.camera.distance.toFixed(1)}|${p.x.toFixed(1)}|${p.y.toFixed(1)}`;
    const every = this._game.speed > 0 ? 2 : 8;
    if (key !== this._shadowKey || ++this._shadowSkip >= every) {
      this._shadowKey = key;
      this._shadowSkip = 0;
      this.three.shadowMap.needsUpdate = true;
    }
  }

  /** Динамическое разрешение: при FPS ниже ~48 масштаб снижается шагами до 0.6, при стабильных ~57+ — возвращается. */
  private _adaptResolution(dt: number): void {
    if (!graphics.get().autoRes || dt <= 0) return;
    this._ema += (dt - this._ema) * 0.1;
    this._dynTimer += dt;
    if (this._dynTimer < 0.75) return;
    this._dynTimer = 0;
    const fps = 1 / this._ema;
    let next = this._dyn;
    if (fps < 48 && this._dyn > 0.6) {
      next = Math.max(0.6, this._dyn - 0.1);
      this._good = 0;
    } else if (fps > 56) {
      if (++this._good >= 4 && this._dyn < 1) {
        next = Math.min(1, this._dyn + 0.05);
        this._good = 0;
      }
    } else this._good = 0;
    if (next !== this._dyn) {
      this._dyn = next;
      this.three.setPixelRatio(this._basePR * this._dyn);
      this.resize();
    }
  }

  /** текущий множитель динамического разрешения (для индикатора FPS) */
  get dynamicScale(): number {
    return this._dyn;
  }

  private _light(): void {
    const tod = this.dayNight ? this._game.get('time').tod : this._fixed;
    const a = (tod - 0.25) * Math.PI * 2;
    const height = Math.sin(a);
    const day = smoothstep(-0.12, 0.3, height);
    const dusk = 1 - Math.abs(clamp(height * 3.2, -1, 1));
    const tgt = this.camera.target;
    const dir = new Vector3(Math.cos(a) * 0.9, Math.max(0.12, height) + 0.1, 0.5).normalize();
    this._sun.target.position.copy(tgt);
    this._sun.position.copy(tgt).addScaledVector(dir, 400);
    this._sun.intensity = 2.3 * day;
    // золотой час: у горизонта солнце оранжевое, днём — почти белое
    this._sun.color.copy(WARM_SUN).lerp(WHITE_SUN, smoothstep(0.04, 0.55, height));
    this._hemi.intensity = 0.55 + 0.2 * day;
    this._hemi.color.setHex(0xbfdcff).lerp(tod < 0.5 ? DAWN_SKY : DUSK_SKY, dusk * 0.45 * day);
    this._amb.intensity = 0.55 * (1 - day) + 0.1;

    const half = clamp(this.camera.distance * 0.75, 90, 260);
    const sc = this._sun.shadow.camera;
    if (Math.abs(sc.right - half) > 1) {
      sc.left = -half;
      sc.right = half;
      sc.top = half;
      sc.bottom = -half;
      sc.near = 10;
      sc.far = 900;
      sc.updateProjectionMatrix();
    }

    this._sky.copy(NIGHT_SKY).lerp(DAY_SKY, day).lerp(tod < 0.5 ? DAWN_SKY : DUSK_SKY, dusk * 0.6 * (day > 0.02 ? 1 : 0.4));
    (this.scene.background as Color).copy(this._sky);
    (this.scene.fog as Fog).color.copy(this._sky);
    this.night = this.dayNight ? 1 - smoothstep(-0.05, 0.25, height) : 0;
    this.buildings.materials.setNight(this.night);
  }
}
