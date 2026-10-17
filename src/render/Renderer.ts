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
import { CameraController } from './CameraController';
import { PedestrianView } from './PedestrianView';
import { PreviewView } from './PreviewView';
import { RoadView } from './RoadView';
import { RouteView } from './RouteView';
import { TrafficLightView } from './TrafficLightView';
import { TerrainView } from './TerrainView';
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
  private _views: View[] = [];
  private _sun = new DirectionalLight(0xfff1d6, 2.4);
  private _hemi = new HemisphereLight(0xbfdcff, 0x5a6a4a, 0.9);
  private _amb = new AmbientLight(0x5a6ca0, 0.2);
  private _sky = new Color();
  private _fixed = 0.45;

  constructor(canvas: HTMLCanvasElement, private _game: Game) {
    this.three = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.three.outputColorSpace = SRGBColorSpace;
    this.three.toneMapping = ACESFilmicToneMapping;
    this.three.toneMappingExposure = _game.config.render.exposure;
    this.three.shadowMap.enabled = true;
    this.three.shadowMap.type = PCFShadowMap;

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
      new TreeView(this.scene, _game),
      new TrafficLightView(this.scene, _game),
      new VehicleView(this.scene, _game),
      this.routes,
      this.pedestrians,
      new AlertView(this.scene, _game),
    );
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  addView(v: View): void {
    this._views.push(v);
  }

  setShadows(on: boolean): void {
    this.shadows = on;
    this._sun.castShadow = on;
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
    this.three.render(this.scene, this.camera.camera);
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
