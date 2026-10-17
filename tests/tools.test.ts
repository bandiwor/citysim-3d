import { describe, expect, it } from 'vitest';
import type { PreviewState, ToolContext } from '../src/core/Tool';
import type { Pointer } from '../src/core/types';
import { setLocale } from '../src/i18n';
import { BulldozeTool, PlaceTool, RoadTool, SelectTool, StopTool, ZoneTool } from '../src/tools/Tools';
import { createGame, road } from './helpers';

function ctx(game: ReturnType<typeof createGame>) {
  const state: { preview: Partial<PreviewState>; cleared: number } = { preview: {}, cleared: 0 };
  const c: ToolContext = {
    game,
    shift: false,
    setPreview: (p) => Object.assign(state.preview, p),
    clearPreview: () => {
      state.cleared++;
      state.preview = {};
    },
  };
  return { c, state };
}
const P = (x: number, z: number, shift = false): Pointer => ({ x, z, shift });

describe('инструменты', () => {
  setLocale('en');

  it('RoadTool: клик-клик строит дорогу и продолжает цепочку, Esc отменяет', () => {
    const g = createGame();
    const tool = new RoadTool(g, 'street');
    const { c, state } = ctx(g);
    tool.hover(P(40, 100), c);
    expect(state.preview.marker).toBeTruthy();
    tool.down(P(40, 100), c);
    tool.up(P(40, 100), c);
    tool.hover(P(120, 100), c);
    expect(state.preview.ribbon?.ok).toBe(true);
    expect(state.preview.hint).toContain('$');
    tool.down(P(120, 100), c);
    expect(g.world.graph.edges.size).toBeGreaterThan(0);
    tool.up(P(120, 100), c);
    // цепочка: следующий клик продолжает от конца
    tool.down(P(120, 160), c);
    tool.up(P(120, 160), c);
    const nodes = [...g.world.graph.nodes.values()];
    expect(nodes.some((n) => n.edges.length === 2 && Math.abs(n.x - 120) < 1 && Math.abs(n.z - 100) < 1)).toBe(true);
    expect(tool.escape(c)).toBe(true);
    expect(tool.escape(c)).toBe(false);
  });

  it('RoadTool: протяжка мышью работает как два клика; режим кривой требует опорной точки', () => {
    const g = createGame();
    const tool = new RoadTool(g, 'avenue');
    const { c } = ctx(g);
    tool.down(P(40, 100), c);
    tool.move(P(100, 100), c);
    tool.up(P(100, 100), c);
    expect(g.world.graph.edges.size).toBeGreaterThan(0);
    tool.escape(c);
    const before = g.world.graph.edges.size;
    tool.options[0].set('curve');
    tool.down(P(40, 200), c);
    tool.down(P(90, 250), c);
    expect(g.world.graph.edges.size).toBe(before);
    tool.down(P(140, 200), c);
    expect(g.world.graph.edges.size).toBeGreaterThan(before);
    expect(tool.key('KeyC', c)).toBe(true);
    expect(tool.options[0].get()).toBe('straight');
  });

  it('RoadTool: ошибка планировки сообщается, а не строится', () => {
    const g = createGame();
    const tool = new RoadTool(g, 'street');
    const { c } = ctx(g);
    const messages: string[] = [];
    g.bus.on('message', (m) => messages.push(m.key));
    tool.down(P(40, 100), c);
    tool.down(P(42, 100), c);
    expect(messages).toContain('err.road.short');
    expect(g.world.graph.edges.size).toBe(0);
  });

  it('ZoneTool: кисть красит клетки, [ ] меняют размер', () => {
    const g = createGame();
    road(g, 40, 100, 160, 100);
    const tool = new ZoneTool(g, 'res');
    const { c, state } = ctx(g);
    tool.hover(P(100, 112), c);
    const quads0 = state.preview.quads!.length;
    expect(quads0).toBeGreaterThan(0);
    tool.key('BracketRight', c);
    tool.hover(P(100, 112), c);
    expect(state.preview.quads!.length).toBeGreaterThan(quads0);
    tool.down(P(100, 112), c);
    tool.move(P(120, 112), c);
    tool.up();
    const zoned = g.world.zones.list().filter((x) => x.zone).length;
    expect(zoned).toBeGreaterThan(quads0);
    expect(tool.options[0].choices).toHaveLength(g.config.zoning.brushSizes.length);
  });

  it('PlaceTool: примагничивается к дороге, ставит здание и сообщает об ошибке', () => {
    const g = createGame();
    road(g, 40, 100, 160, 100);
    const tool = new PlaceTool(g, 'police');
    const { c, state } = ctx(g);
    tool.hover(P(100, 125), c);
    expect(state.preview.quads![0].ok).toBe(true);
    tool.down(P(100, 125), c);
    expect(g.world.list().filter((b) => b.defId === 'police')).toHaveLength(1);
    const errors: string[] = [];
    g.bus.on('message', (m) => errors.push(m.key));
    tool.down(P(100, 125), c);
    expect(errors).toContain('err.occupied');
    tool.hover(P(100, 300), c);
    expect(state.preview.quads![0].ok).toBe(false);
  });

  it('BulldozeTool: клик сносит объект под курсором, протяжка — область', () => {
    const g = createGame();
    road(g, 40, 100, 160, 100);
    const tool = new BulldozeTool(g);
    const { c } = ctx(g);
    tool.down(P(60, 100), c);
    tool.up(P(60, 100), c);
    expect(g.world.graph.edges.size).toBeLessThan(4);
    tool.down(P(0, 0), c);
    tool.move(P(300, 300), c);
    tool.up(P(300, 300), c);
    expect(g.world.graph.edges.size).toBe(0);
  });

  it('StopTool и SelectTool', () => {
    const g = createGame();
    road(g, 40, 100, 160, 100);
    const stop = new StopTool(g);
    const { c, state } = ctx(g);
    stop.hover(P(80, 103), c);
    expect(state.preview.marker).toBeTruthy();
    stop.down(P(80, 103), c);
    expect(g.world.stops).toHaveLength(1);
    const sel = new SelectTool(g);
    let selected: unknown = 'x';
    g.bus.on('select', (b) => (selected = b));
    sel.up(P(10, 10));
    expect(selected).toBeNull();
    expect(sel.panOnDrag).toBe(true);
  });
});
