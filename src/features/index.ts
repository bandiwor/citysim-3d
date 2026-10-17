import { ROADS } from '../data/roads';
import { SERVICES } from '../data/services';
import { ZONES } from '../data/zones';
import type { Feature } from '../core/System';
import { DemandSystem } from '../sim/DemandSystem';
import { DisasterSystem } from '../sim/DisasterSystem';
import { EconomySystem } from '../sim/EconomySystem';
import { GrowthSystem } from '../sim/GrowthSystem';
import { MapsSystem } from '../sim/MapsSystem';
import { NetworkSystem } from '../sim/NetworkSystem';
import { SaveSystem } from '../sim/SaveSystem';
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
 * Названия и описания берутся из словарей i18n по соглашению: road.<id>.name, zone.<id>.desc, service.<id>.name, tool.<id>.name.
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
    g.addCategory({ id: 'tools', icon: '🧰' });
    g.toolbar.add({ id: 'select', category: 'tools', nameKey: 'tool.select.name', descKey: 'tool.select.desc', icon: '👆', hotkey: 'Escape', createTool: (game) => new SelectTool(game) });
    g.toolbar.add({ id: 'bulldoze', category: 'tools', nameKey: 'tool.bulldoze.name', descKey: 'tool.bulldoze.desc', icon: '🚧', hotkey: 'KeyX', createTool: (game) => new BulldozeTool(game) });
  },
};

export const roadsFeature: Feature = {
  id: 'roads',
  install(g) {
    for (const r of ROADS) g.roadTypes.add({ ...r });
    g.addCategory({ id: 'roads', icon: '🛣️' });
    for (const r of g.roadTypes.all()) {
      g.toolbar.add({ id: `road:${r.id}`, category: 'roads', nameKey: `road.${r.id}.name`, descKey: `road.${r.id}.desc`, icon: r.icon, cost: r.cost, createTool: (game) => new RoadTool(game, r.id) });
    }
  },
};

export const zonesFeature: Feature = {
  id: 'zones',
  install(g) {
    for (const z of ZONES) g.zoneTypes.add({ ...z });
    g.addCategory({ id: 'zones', icon: '🏘️' });
    for (const z of g.zoneTypes.all()) {
      g.toolbar.add({ id: `zone:${z.id}`, category: 'zones', nameKey: `zone.${z.id}.name`, descKey: `zone.${z.id}.desc`, icon: z.icon, cost: z.cost, createTool: (game) => new ZoneTool(game, z.id) });
    }
    g.toolbar.add({ id: 'zone:none', category: 'zones', nameKey: 'tool.dezone.name', descKey: 'tool.dezone.desc', icon: '🧹', createTool: (game) => new ZoneTool(game, null) });
  },
};

const CATEGORY_ICONS: Record<string, string> = { power: '⚡', safety: '🚓', health: '🏥', education: '🎓', parks: '🌳' };

export const servicesFeature: Feature = {
  id: 'services',
  install(g) {
    for (const s of SERVICES) g.services.add({ ...s });
    const added = new Set<string>();
    for (const s of g.services.all()) {
      if (!added.has(s.category)) {
        added.add(s.category);
        g.addCategory({ id: s.category, icon: CATEGORY_ICONS[s.category] ?? '🏢' });
      }
      g.toolbar.add({ id: `service:${s.id}`, category: s.category, nameKey: `service.${s.id}.name`, descKey: `service.${s.id}.desc`, icon: s.icon, cost: s.cost, createTool: (game) => new PlaceTool(game, s.id) });
    }
  },
};

export const trafficFeature: Feature = {
  id: 'traffic',
  install(g) {
    g.addSystem(new TrafficSystem());
    g.addSystem(new TransitSystem());
    g.addCategory({ id: 'transit', icon: '🚌' });
    g.toolbar.add({ id: 'stop', category: 'transit', nameKey: 'tool.stop.name', descKey: 'tool.stop.desc', icon: '🚏', cost: g.config.economy.stopCost, createTool: (game) => new StopTool(game) });
  },
};

export const disastersFeature: Feature = {
  id: 'disasters',
  install(g) {
    g.addSystem(new DisasterSystem());
  },
};
