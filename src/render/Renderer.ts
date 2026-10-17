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
import { AlertView } from './AlertView';
import { BuildingView } from './BuildingView';
import { CameraController } from './CameraController';
import { PreviewView } from './PreviewView';
import { RoadView } from './RoadView';
import { TerrainView } from './TerrainView';
import { TreeView } from './TreeView';
import { VehicleView } from './VehicleView';
import type { View } from './View';
import { GridView, OverlayView, ZoneLayerView } from './ZoneOverlayViews';

const DAY_SKY = new Color(0x8fc4ee);
const DUSK_SKY = new Color(0xe9a070);
const NIGHT_SKY = new Color(0x0b1226);

/** Сцена, свет, смена дня/ночи, тени и список видов. */
export class Renderer {
  readonly three: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: CameraController;
  readonly preview: PreviewView;
  readonly grid: GridView;
  readonly buildings: BuildingView;
  shadows = true;
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
    this.three.toneMappingExposure = 0.9;
    this.three.shadowMap.enabled = true;
    this.three.shadowMap.type = PCFShadowMap;

    this.camera = new CameraController(canvas, _game.world.size);
    this.scene.fog = new Fog(DAY_SKY.getHex(), 300, 1500);
    this.scene.background = DAY_SKY.clone();

    this._sun.castShadow = true;
    this._sun.shadow.mapSize.set(2048, 2048);
    this._sun.shadow.bias = -0.0004;
    this._sun.shadow.normalBias = 0.6;
    this.scene.add(this._sun, this._sun.target, this._hemi, this._amb);

    new TerrainView(this.scene, _game.world);
    this.buildings = new BuildingView(this.scene, _game);
    this.preview = new PreviewView(this.scene);
    this.grid = new GridView(this.scene, _game.world.size);
    this._views.push(
      new RoadView(this.scene, _game),
      new ZoneLayerView(this.scene, _game),
      new OverlayView(this.scene, _game),
      this.buildings,
      new TreeView(this.scene, _game),
      new VehicleView(this.scene, _game),
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
    this._sun.color.setRGB(1, 0.85 + 0.15 * day, 0.7 + 0.3 * day);
    this._hemi.intensity = 0.55 + 0.2 * day;
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

    this._sky.copy(NIGHT_SKY).lerp(DAY_SKY, day).lerp(DUSK_SKY, dusk * 0.45 * (day > 0.02 ? 1 : 0.4));
    (this.scene.background as Color).copy(this._sky);
    (this.scene.fog as Fog).color.copy(this._sky);
    this.buildings.materials.setNight(this.dayNight ? 1 - smoothstep(-0.05, 0.25, height) : 0);
  }
}
