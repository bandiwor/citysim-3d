import type { Game } from '../core/Game';

/** Цветовая шкала «плохо → хорошо» (красный → жёлтый → зелёный). */
function goodBad(v: number, out: Uint8ClampedArray, a = 150): void {
  const t = Math.min(1, Math.max(0, v));
  out[0] = t < 0.5 ? 230 : 230 - (t - 0.5) * 2 * 170;
  out[1] = t < 0.5 ? 70 + t * 2 * 150 : 220;
  out[2] = 60;
  out[3] = a;
}

/** Холодная шкала покрытия (прозрачный → синий → бирюзовый). */
function coverage(v: number, out: Uint8ClampedArray): boolean {
  if (v <= 0.02) return false;
  out[0] = 40;
  out[1] = 120 + v * 100;
  out[2] = 255 - v * 60;
  out[3] = 60 + v * 120;
  return true;
}

export function registerOverlays(g: Game): void {
  const cov = (id: string, name: string, icon: string, type: string): void => {
    g.overlays.add({
      id,
      name,
      icon,
      colorize: (game, i, out) => coverage(game.get('maps').coverage(type)[i], out),
    });
  };
  g.overlays.add({
    id: 'power',
    name: 'Электричество',
    icon: '⚡',
    colorize: (game, i, out) => {
      const w = game.world;
      const b = w.occupant[i] ? w.buildings.get(w.occupant[i]) : undefined;
      if (b) {
        goodBad(b.powered ? 1 : 0, out, 190);
        return true;
      }
      if (w.road[i]) {
        const net = game.get('network');
        out.set([255, 214, 0, 80]);
        return net.comp[i] >= 0;
      }
      return false;
    },
  });
  g.overlays.add({
    id: 'water',
    name: 'Вода',
    icon: '💧',
    colorize: (game, i, out) => {
      const w = game.world;
      const b = w.occupant[i] ? w.buildings.get(w.occupant[i]) : undefined;
      if (b) {
        goodBad(b.watered ? 1 : 0, out, 190);
        return true;
      }
      if (w.road[i]) {
        out.set([60, 150, 255, 90]);
        return true;
      }
      return false;
    },
  });
  cov('police', 'Полиция', '🚓', 'police');
  cov('fire', 'Пожарные', '🚒', 'fire');
  cov('health', 'Здоровье', '🏥', 'health');
  cov('education', 'Образование', '🎓', 'education');
  cov('park', 'Парки', '🌳', 'park');
  g.overlays.add({
    id: 'pollution',
    name: 'Загрязнение',
    icon: '☁️',
    colorize: (game, i, out) => {
      const v = game.get('maps').pollution[i];
      if (v < 0.03) return false;
      goodBad(1 - v, out, 100 + v * 100);
      return true;
    },
  });
  g.overlays.add({
    id: 'land',
    name: 'Стоимость земли',
    icon: '💰',
    colorize: (game, i, out) => {
      const w = game.world;
      if (w.terrain[i] !== 0) return false;
      goodBad(game.get('maps').landValue[i], out, 130);
      return true;
    },
  });
  g.overlays.add({
    id: 'traffic',
    name: 'Трафик',
    icon: '🚗',
    colorize: (game, i, out) => {
      const w = game.world;
      const r = w.road[i];
      if (!r) return false;
      const k = game.get('traffic').occupancy[i] / game.roadTypes.at(r - 1).capacity;
      goodBad(1 - Math.min(1, k * 1.1), out, 200);
      return true;
    },
  });
  g.overlays.add({
    id: 'happiness',
    name: 'Счастье',
    icon: '😀',
    colorize: (game, i, out) => {
      const w = game.world;
      const b = w.occupant[i] ? w.buildings.get(w.occupant[i]) : undefined;
      if (!b || b.kind !== 'zone') return false;
      goodBad(b.happiness * 1.2 - 0.1, out, 200);
      return true;
    },
  });
}
