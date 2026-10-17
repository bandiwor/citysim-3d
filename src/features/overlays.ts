import { CELL } from '../config/constants';
import type { Game, OverlayPainter } from '../core/Game';

type Rgba = [number, number, number, number];

/** Цветовая шкала «плохо → хорошо» (красный → жёлтый → зелёный). */
function goodBad(v: number, a = 150): Rgba {
  const t = Math.min(1, Math.max(0, v));
  return [t < 0.5 ? 230 : 230 - (t - 0.5) * 2 * 170, t < 0.5 ? 70 + t * 2 * 150 : 220, 60, a];
}

/** Холодная шкала покрытия (прозрачный → синий → бирюзовый). */
const cool = (v: number): Rgba => [40, 120 + v * 100, 255 - v * 60, 60 + v * 120];

/** Заливает клетки сетки, которые покрывает основание здания. */
function paintBuilding(g: Game, p: OverlayPainter, color: (b: ReturnType<Game['world']['list']>[number]) => Rgba | null): void {
  for (const b of g.world.list()) {
    const c = color(b);
    if (!c) continue;
    const r = Math.hypot(b.w, b.d) / 2;
    for (let z = Math.floor((b.z - r) / CELL); z <= Math.floor((b.z + r) / CELL); z++) {
      for (let x = Math.floor((b.x - r) / CELL); x <= Math.floor((b.x + r) / CELL); x++) {
        if (x >= 0 && z >= 0 && x < p.size && z < p.size) p.set(z * p.size + x, c[0], c[1], c[2], c[3]);
      }
    }
  }
}

/** Заливает клетки сетки вдоль дорог (по точкам ломаной). */
function paintRoads(g: Game, p: OverlayPainter, color: (edgeId: number) => Rgba | null): void {
  for (const e of g.world.graph.edges.values()) {
    const c = color(e.id);
    if (!c) continue;
    for (let s = 0; s <= e.len; s += CELL / 2) {
      const pt = g.world.graph.pointAt(e, s);
      const x = Math.floor(pt.x / CELL);
      const z = Math.floor(pt.z / CELL);
      if (x >= 0 && z >= 0 && x < p.size && z < p.size) p.set(z * p.size + x, c[0], c[1], c[2], c[3]);
    }
  }
}

export function registerOverlays(g: Game): void {
  const coverage = (id: string, icon: string, type: string): void => {
    g.overlays.add({
      id,
      icon,
      paint(game, p) {
        const a = game.get('maps').coverage(type);
        for (let i = 0; i < a.length; i++) if (a[i] > 0.02) p.set(i, ...cool(a[i]));
      },
    });
  };
  g.overlays.add({
    id: 'power',
    icon: '⚡',
    paint(game, p) {
      paintRoads(game, p, () => [255, 214, 0, 80]);
      paintBuilding(game, p, (b) => (b.powerNeed > 0 || b.powerOut > 0 ? goodBad(b.powered ? 1 : 0, 190) : null));
    },
  });
  g.overlays.add({
    id: 'water',
    icon: '💧',
    paint(game, p) {
      paintRoads(game, p, () => [60, 150, 255, 90]);
      paintBuilding(game, p, (b) => (b.waterNeed > 0 || b.waterOut > 0 ? goodBad(b.watered ? 1 : 0, 190) : null));
    },
  });
  coverage('police', '🚓', 'police');
  coverage('fire', '🚒', 'fire');
  coverage('health', '🏥', 'health');
  coverage('education', '🎓', 'education');
  coverage('park', '🌳', 'park');
  g.overlays.add({
    id: 'pollution',
    icon: '☁️',
    paint(game, p) {
      const a = game.get('maps').pollution;
      for (let i = 0; i < a.length; i++) if (a[i] >= 0.03) p.set(i, ...goodBad(1 - a[i], 100 + a[i] * 100));
    },
  });
  g.overlays.add({
    id: 'land',
    icon: '💰',
    paint(game, p) {
      const a = game.get('maps').landValue;
      const w = game.world;
      for (let i = 0; i < a.length; i++) if (w.terrain[i] === 0) p.set(i, ...goodBad(a[i], 130));
    },
  });
  g.overlays.add({
    id: 'traffic',
    icon: '🚗',
    paint(game, p) {
      const traffic = game.get('traffic');
      paintRoads(game, p, (id) => goodBad(1 - Math.min(1, traffic.load(id) * 1.1), 200));
    },
  });
  g.overlays.add({
    id: 'happiness',
    icon: '😀',
    paint(game, p) {
      paintBuilding(game, p, (b) => (b.kind === 'zone' ? goodBad(b.happiness * 1.2 - 0.1, 200) : null));
    },
  });
  g.overlays.add({
    id: 'garbage',
    icon: '🗑️',
    paint(game, p) {
      const cap = game.config.garbage.cap;
      paintBuilding(game, p, (b) => (b.kind === 'zone' ? goodBad(1 - b.garbage / cap, 200) : null));
    },
  });
  g.overlays.add({
    id: 'crime',
    icon: '🚨',
    paint(game, p) {
      const rate = game.get('crime');
      paintBuilding(game, p, (b) => (b.kind === 'zone' ? goodBad(1 - Math.min(1, rate.rateOf(b) / (game.config.crime.baseRate * 3)), 190) : null));
    },
  });
  g.overlays.add({
    id: 'level',
    icon: '⭐',
    paint(game, p) {
      paintBuilding(game, p, (b) => {
        if (b.kind === 'zone') {
          const max = game.zoneTypes.require(b.zone).levels.length;
          return goodBad((b.level - 1) / Math.max(1, max - 1), 200);
        }
        const lv = game.builder.serviceLevel(b);
        return lv.max > 1 ? goodBad((lv.level - 1) / (lv.max - 1), 200) : null;
      });
    },
  });
}
