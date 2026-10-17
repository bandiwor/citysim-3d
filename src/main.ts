import './style.css';
import { AudioEngine } from './audio/AudioEngine';
import { collectAmbient } from './audio/collect';
import { mergeConfig } from './config/gameConfig';
import { Game } from './core/Game';
import { coreFeature, disastersFeature, roadsFeature, servicesFeature, trafficFeature, zonesFeature } from './features';
import { detectLocale, setLocale, t } from './i18n';
import { Renderer } from './render/Renderer';
import { SaveSystem } from './sim/SaveSystem';
import { h } from './ui/dom';
import { showStartScreen } from './ui/StartScreen';
import { UI } from './ui/UI';
import { InlineCompute } from './workers/InlineCompute';
import type { ComputeBackend } from './workers/protocol';
import { WorkerCompute, workersSupported } from './workers/WorkerCompute';
import { terrainParams } from './world/Terrain';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const root = document.getElementById('ui') as HTMLElement;

async function boot(): Promise<void> {
  setLocale(detectLocale());
  const config = mergeConfig();
  const audio = new AudioEngine(config.audio);
  const choice = await showStartScreen(root, config.save.key, audio);

  const loading = h('div', { class: 'start' }, h('div', { class: 'start-box' }, h('h1', { text: t('app.title') }), h('p', { text: t('start.generating') })));
  root.append(loading);

  // тяжёлые расчёты (рельеф, карты влияния, поиск пути) идут в Web Worker
  const compute: ComputeBackend = workersSupported() ? new WorkerCompute() : new InlineCompute();
  const terrain = await compute.generateTerrain(terrainParams(config, choice.seed));
  const build = (): Game => {
    const g = new Game({ seed: choice.seed, terrain, compute });
    // Подключение механик: данные (дороги/зоны/службы) до систем, которые их читают.
    g.use(roadsFeature).use(zonesFeature).use(servicesFeature).use(trafficFeature).use(coreFeature).use(disastersFeature);
    return g;
  };
  let game = build();
  if (choice.load) {
    const data = SaveSystem.peek(game.config.save.key);
    if (data) {
      try {
        SaveSystem.apply(game, data);
      } catch (err) {
        // повреждённое/несовместимое сохранение не должно ломать запуск: начинаем новый город
        console.error('Не удалось загрузить сохранение', err);
        game = build();
        game.message('msg.loadFailed', undefined, 'bad');
      }
    }
  }
  game.start();
  loading.remove();

  const renderer = new Renderer(canvas, game);
  audio.attach(game);
  const ui = new UI(root, game, renderer, canvas, audio, () => location.reload());

  let last = performance.now();
  const loop = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    ui.input.tick(dt);
    game.step(dt);
    renderer.frame(dt, dt * game.speed);
    const target = renderer.camera.target;
    audio.update(dt, collectAmbient(game, { x: target.x, z: target.z, distance: renderer.camera.distance, night: renderer.night }));
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  if (import.meta.env.DEV) Object.assign(window, { game, renderer, ui, audio });
}

void boot();
