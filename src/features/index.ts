import { ROADS } from '../data/roads';
import { SERVICES } from '../data/services';
import { ZONES } from '../data/zones';
import type { Feature } from '../core/System';
import { DemandSystem } from '../sim/DemandSystem';
import { DisasterSystem } from '../sim/DisasterSystem';
import { EconomySystem } from '../sim/EconomySystem';
import { GrowthSystem } from '../sim/GrowthSystem';
import { MapsSystem } from '../sim/MapsSystem';
import { SaveSystem } from '../sim/SaveSystem';
import { NetworkSystem } from '../sim/NetworkSystem';
import { StatsSystem } from '../sim/StatsSystem';
import { TimeSystem } from '../sim/TimeSystem';
import { TrafficSystem } from '../sim/TrafficSystem';
import { TransitSystem } from '../sim/TransitSystem';
import { UtilitySystem } from '../sim/UtilitySystem';
import { BulldozeTool, PlaceTool, RoadTool, SelectTool, StopTool, ZoneTool } from '../tools/Tools';
import { registerOverlays } from './overlays';

/*
 * Каждая «фича» — независимый пакет: данные + системы + кнопки панели + оверлеи.
 * Чтобы добавить новую механику, достаточно написать Feature и подключить её в main.ts через game.use(...).
 */

/** Базовая симуляция: время, дорожная сеть, коммуналка, карты влияния, статистика, спрос, рост, экономика. */
export const coreFeature: Feature = {
  id: 'core',
  install(g) {
    g.addSystem(new TimeSystem());
    g.addSystem(new NetworkSystem());
    g.addSystem(new UtilitySystem());
    g.addSystem(new MapsSystem());
    g.addSystem(new StatsSystem());
    g.addSystem(new DemandSystem());
    g.addSystem(new GrowthSystem());
    g.addSystem(new EconomySystem());
    g.addSystem(new SaveSystem());
    registerOverlays(g);
    g.addCategory({ id: 'tools', name: 'Инструменты', icon: '🧰' });
    g.toolbar.add({ id: 'select', category: 'tools', name: 'Выбор', icon: '👆', desc: 'Осмотр зданий. Перетаскивание — двигать камеру.', hotkey: 'Escape', createTool: (game) => new SelectTool(game) });
    g.toolbar.add({ id: 'bulldoze', category: 'tools', name: 'Снос', icon: '🚧', desc: 'Снести дороги, здания и зоны в области.', hotkey: 'KeyX', createTool: (game) => new BulldozeTool(game) });
  },
};

export const roadsFeature: Feature = {
  id: 'roads',
  install(g) {
    for (const r of ROADS) g.roadTypes.add({ ...r });
    g.addCategory({ id: 'roads', name: 'Дороги', icon: '🛣️' });
    for (const r of g.roadTypes.all()) {
      g.toolbar.add({ id: `road:${r.id}`, category: 'roads', name: r.name, icon: r.icon, desc: r.desc, cost: r.cost, createTool: (game) => new RoadTool(game, r.id) });
    }
  },
};

export const zonesFeature: Feature = {
  id: 'zones',
  install(g) {
    for (const z of ZONES) g.zoneTypes.add({ ...z });
    g.addCategory({ id: 'zones', name: 'Зонирование', icon: '🏘️' });
    for (const z of g.zoneTypes.all()) {
      g.toolbar.add({ id: `zone:${z.id}`, category: 'zones', name: z.name, icon: z.icon, desc: z.desc, cost: z.cost, createTool: (game) => new ZoneTool(game, z.id) });
    }
    g.toolbar.add({ id: 'zone:none', category: 'zones', name: 'Убрать зону', icon: '🧹', desc: 'Снять зонирование.', createTool: (game) => new ZoneTool(game, null) });
  },
};

const CATEGORIES: Record<string, { name: string; icon: string }> = {
  power: { name: 'Энергия и вода', icon: '⚡' },
  safety: { name: 'Безопасность', icon: '🚓' },
  health: { name: 'Здоровье', icon: '🏥' },
  education: { name: 'Образование', icon: '🎓' },
  parks: { name: 'Парки', icon: '🌳' },
};

export const servicesFeature: Feature = {
  id: 'services',
  install(g) {
    for (const s of SERVICES) g.services.add({ ...s });
    const added = new Set<string>();
    for (const s of g.services.all()) {
      if (!added.has(s.category)) {
        added.add(s.category);
        const c = CATEGORIES[s.category] ?? { name: s.category, icon: '🏢' };
        g.addCategory({ id: s.category, ...c });
      }
      g.toolbar.add({ id: `service:${s.id}`, category: s.category, name: s.name, icon: s.icon, desc: s.desc, cost: s.cost, createTool: (game) => new PlaceTool(game, s.id) });
    }
  },
};

export const trafficFeature: Feature = {
  id: 'traffic',
  install(g) {
    g.addSystem(new TrafficSystem());
    g.addSystem(new TransitSystem());
    g.addCategory({ id: 'transit', name: 'Транспорт', icon: '🚌' });
    g.toolbar.add({ id: 'stop', category: 'transit', name: 'Автобусная остановка', icon: '🚏', desc: 'Остановки одной сети объединяются в маршрут. Нужно ≥2.', cost: 250, createTool: (game) => new StopTool(game) });
  },
};

export const disastersFeature: Feature = {
  id: 'disasters',
  install(g) {
    g.addSystem(new DisasterSystem());
  },
};
