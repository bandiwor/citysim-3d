import './style.css';
import { Game } from './core/Game';
import { coreFeature, disastersFeature, roadsFeature, servicesFeature, trafficFeature, zonesFeature } from './features';
import { Renderer } from './render/Renderer';
import { SaveSystem } from './sim/SaveSystem';
import { showStartScreen } from './ui/StartScreen';
import { UI } from './ui/UI';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const root = document.getElementById('ui') as HTMLElement;

async function boot(): Promise<void> {
  const choice = await showStartScreen(root);
  const game = new Game({ seed: choice.seed, size: 80 });

  // Подключение механик. Порядок регистрации данных важен (дороги/зоны/службы до систем, которые их читают).
  game
    .use(roadsFeature)
    .use(zonesFeature)
    .use(servicesFeature)
    .use(trafficFeature)
    .use(coreFeature)
    .use(disastersFeature);

  if (choice.load) {
    const data = SaveSystem.peek();
    if (data) SaveSystem.apply(game, data);
  }
  game.start();

  const renderer = new Renderer(canvas, game);
  new UI(root, game, renderer, canvas, () => location.reload());

  let last = performance.now();
  const loop = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.step(dt);
    renderer.frame(dt, dt * game.speed);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // Для отладки/тестов в dev-режиме.
  if (import.meta.env.DEV) Object.assign(window, { game, renderer });
}

void boot();
