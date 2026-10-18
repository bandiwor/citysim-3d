import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../src/ui/Input';
import { createGame, road } from './helpers';

type Handler = (e: unknown) => void;

/** Минимальные заглушки DOM и камеры: проверяем только логику жестов. */
function setup(toolId: string, prepare?: (game: ReturnType<typeof createGame>) => void, scale = 0.1) {
  const handlers = new Map<string, Handler[]>();
  const on = (type: string, fn: Handler): void => void handlers.set(type, [...(handlers.get(type) ?? []), fn]);
  const target = { addEventListener: on, setPointerCapture: () => {} };
  vi.stubGlobal('window', { addEventListener: on });
  vi.stubGlobal('document', { addEventListener: on });
  const cam = { groundAt: (x: number, y: number) => ({ x: x * scale, z: y * scale }), panPixels: vi.fn(), zoom: vi.fn(), rotate: vi.fn() };
  const renderer = { camera: cam, zoneLayer: { setGridVisible: () => {} }, preview: { apply: () => {}, clear: () => {} } };
  const game = createGame();
  prepare?.(game);
  const input = new Input(target as unknown as HTMLCanvasElement, renderer as never, game);
  input.setTool(toolId);
  const fire = (type: string, id: number, x: number, y: number): void => {
    for (const fn of handlers.get(type) ?? []) fn({ pointerType: 'touch', pointerId: id, clientX: x, clientY: y, button: 0, target, shiftKey: false });
  };
  return { input, cam, game, fire };
}

describe('сенсорное управление', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('один палец двигает камеру и не рисует дорогу', () => {
    const { input, cam, game, fire } = setup('road:street');
    fire('pointerdown', 1, 200, 200);
    fire('pointermove', 1, 260, 230);
    fire('pointerup', 1, 260, 230);
    expect(cam.panPixels).toHaveBeenCalled();
    expect(input.hasPending).toBe(false);
    expect(game.world.graph.nodes.size).toBe(0);
  });

  it('первая точка дороги ставится сразу чётким тапом, вторая ждёт подтверждения', () => {
    const { input, fire } = setup('road:street');
    expect(input.tool!.touchInstant!()).toBe(true);
    fire('pointerdown', 1, 200, 200);
    fire('pointerup', 1, 200, 200);
    expect(input.hasPending).toBe(false);
    expect(input.tool!.touchInstant!()).toBe(false);
    fire('pointerdown', 1, 400, 200);
    fire('pointerup', 1, 400, 200);
    expect(input.hasPending).toBe(true);
    fire('pointerdown', 1, 405, 203);
    fire('pointerup', 1, 405, 203);
    expect(input.hasPending).toBe(false);
  });

  it('долгое касание на месте не считается тапом', () => {
    const { input, fire } = setup('road:street');
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValueOnce(0);
    fire('pointerdown', 1, 200, 200);
    now.mockReturnValue(900);
    fire('pointerup', 1, 200, 200);
    expect(input.tool!.touchInstant!()).toBe(true);
    now.mockRestore();
  });

  it('кисть по умолчанию не рисует: палец двигает камеру, рисование включается кнопкой', () => {
    const { input, cam, fire } = setup('terraform:raise');
    const down = vi.fn();
    input.tool!.down = down;
    fire('pointerdown', 1, 200, 200);
    fire('pointermove', 1, 260, 230);
    fire('pointerup', 1, 260, 230);
    expect(down).not.toHaveBeenCalled();
    expect(cam.panPixels).toHaveBeenCalled();
    fire('pointerdown', 1, 200, 200);
    fire('pointerup', 1, 200, 200);
    expect(down).not.toHaveBeenCalled();
    input.touchDraw = true;
    fire('pointerdown', 1, 200, 200);
    expect(down).toHaveBeenCalledTimes(1);
    fire('pointerup', 1, 200, 200);
  });

  it('✖ сначала снимает точку и оставляет инструмент', () => {
    const { input, fire } = setup('road:street');
    fire('pointerdown', 1, 200, 200);
    fire('pointerup', 1, 200, 200);
    fire('pointerdown', 1, 400, 200);
    fire('pointerup', 1, 400, 200);
    expect(input.hasPending).toBe(true);
    input.cancel();
    expect(input.hasPending).toBe(false);
    expect(input.toolId).toBe('road:street');
    input.cancel(); // отмена начатой дороги
    expect(input.toolId).toBe('road:street');
    input.cancel();
    expect(input.toolId).toBe('select');
  });

  it('два пальца: щипок масштабирует и не наклоняет', () => {
    const { cam, fire } = setup('select');
    fire('pointerdown', 1, 100, 200);
    fire('pointerdown', 2, 200, 200);
    for (let i = 1; i <= 8; i++) {
      fire('pointermove', 1, 100 - i * 6, 200);
      fire('pointermove', 2, 200 + i * 6, 200);
    }
    expect(cam.zoom).toHaveBeenCalled();
    expect(cam.rotate).not.toHaveBeenCalled();
  });

  it('два пальца вниз вместе — наклон вида сверху', () => {
    const { cam, fire } = setup('select');
    fire('pointerdown', 1, 100, 200);
    fire('pointerdown', 2, 200, 200);
    for (let i = 1; i <= 8; i++) {
      fire('pointermove', 1, 100, 200 + i * 6);
      fire('pointermove', 2, 200, 200 + i * 6);
    }
    expect(cam.rotate).toHaveBeenCalled();
    const [yaw, pitch] = cam.rotate.mock.calls.at(-1)!;
    expect(yaw).toBe(0);
    expect(pitch).toBeGreaterThan(0);
    expect(cam.zoom).not.toHaveBeenCalled();
  });

  it('разворот пальцев вращает камеру', () => {
    const { cam, fire } = setup('select');
    fire('pointerdown', 1, 100, 200);
    fire('pointerdown', 2, 200, 200);
    for (let i = 1; i <= 10; i++) {
      const a = (i * 0.05) % 3.14;
      fire('pointermove', 1, 150 - Math.cos(a) * 50, 200 - Math.sin(a) * 50);
      fire('pointermove', 2, 150 + Math.cos(a) * 50, 200 + Math.sin(a) * 50);
    }
    expect(cam.rotate.mock.calls.some(([yaw]) => yaw !== 0)).toBe(true);
    expect(cam.rotate.mock.calls.every(([, pitch]) => pitch === 0)).toBe(true);
  });

  it('здание пальцем: привязка к дороге с учётом отдаления камеры и подбор свободного места', () => {
    // 1 пиксель = 1 м (камера отдалена): касание в 70 м от дороги всё равно прилипает к ней
    const { input, game, fire } = setup('', (g) => road(g, 100, 200, 400, 200), 1);
    const id = [...game.toolbar.all()].find((i) => i.id.startsWith('service:') && game.services.require(i.id.slice(8)).size[0] <= 2)!.id;
    input.setTool(id);
    const tap = (x: number, y: number): void => {
      fire('pointerdown', 1, x, y);
      fire('pointerup', 1, x, y);
    };
    tap(250, 270);
    tap(251, 271);
    expect(game.world.buildings.size).toBe(1);
    // касание прямо в уже стоящее здание: место подбирается рядом, а не «занято»
    const b = [...game.world.buildings.values()][0];
    tap(b.x, b.z);
    tap(b.x + 1, b.z + 1);
    expect(game.world.buildings.size).toBe(2);
  });
});
