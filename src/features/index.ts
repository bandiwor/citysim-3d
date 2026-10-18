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
import { LightTool, RouteTool, StopTool, TerraformTool, WalkTool } from '../tools/MoreTools';
import { BulldozeTool, PlaceTool, RoadTool, SelectTool, ZoneTool } from '../tools/Tools';
import { CrimeSystem } from '../sim/CrimeSystem';
import { PedestrianSystem } from '../sim/PedestrianSystem';
import { POLICIES } from '../data/policies';
import { ModifierSystem } from '../sim/ModifierSystem';
import { PolicySystem } from '../sim/PolicySystem';
import { ProgressSystem } from '../sim/ProgressSystem';
import { ObjectiveSystem } from '../sim/ObjectiveSystem';
import { EventSystem } from '../sim/EventSystem';
import { AdvisorSystem } from '../sim/AdvisorSystem';
import { ConstructionSystem } from '../sim/ConstructionSystem';
import { DiseaseSystem } from '../sim/DiseaseSystem';
import { DiagnosticsSystem } from '../sim/DiagnosticsSystem';
import { PropSystem } from '../sim/PropSystem';
import { NatureTool } from '../tools/NatureTools';
import { TaxiSystem } from '../sim/TaxiSystem';
import { FleetSystem } from '../sim/FleetSystem';
import { SanitationSystem } from '../sim/SanitationSystem';
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
    g.addSystem(new ModifierSystem());
    for (const p of POLICIES) g.policies.add({ ...p });
    g.addSystem(new PolicySystem());
    g.addSystem(new ProgressSystem());
    g.addSystem(new ObjectiveSystem());
    g.addSystem(new EventSystem());
    g.addSystem(new AdvisorSystem());
    g.addSystem(new NetworkSystem());
    g.addSystem(new ConstructionSystem());
    g.addSystem(new UtilitySystem());
    g.addSystem(new MapsSystem());
    g.addSystem(new StatsSystem());
    g.addSystem(new DemandSystem());
    g.addSystem(new GrowthSystem());
    g.addSystem(new EconomySystem());
    g.addSystem(new SanitationSystem());
    g.addSystem(new CrimeSystem());
    g.addSystem(new DiseaseSystem());
    g.addSystem(new PedestrianSystem());
    g.addSystem(new DiagnosticsSystem());
    g.addSystem(new SaveSystem());
    registerOverlays(g);
    g.addCategory({ id: 'tools', icon: '🧰' });
    g.toolbar.add({ id: 'select', category: 'tools', nameKey: 'tool.select.name', descKey: 'tool.select.desc', icon: '👆', hotkey: 'Escape', createTool: (game) => new SelectTool(game) });
    g.toolbar.add({ id: 'bulldoze', category: 'tools', nameKey: 'tool.bulldoze.name', descKey: 'tool.bulldoze.desc', icon: '🚧', hotkey: 'KeyX', createTool: (game) => new BulldozeTool(game) });
    g.toolbar.add({ id: 'walk', category: 'tools', nameKey: 'tool.walk.name', descKey: 'tool.walk.desc', icon: '🚶', createTool: (game) => new WalkTool(game) });
    // рельеф
    g.addCategory({ id: 'terrain', icon: '⛰️' });
    const terra: [string, string][] = [['raise', '⬆️'], ['lower', '⬇️'], ['flatten', '🟰'], ['smooth', '〰️']];
    for (const [mode, icon] of terra) {
      g.toolbar.add({ id: `terraform:${mode}`, category: 'terrain', nameKey: `tool.terraform.${mode}.name`, descKey: `tool.terraform.${mode}.desc`, icon, cost: g.config.terraform.costPerVertex, createTool: (game) => new TerraformTool(game, mode as 'raise' | 'lower' | 'flatten' | 'smooth') });
    }
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
    g.toolbar.add({ id: 'light:add', category: 'roads', nameKey: 'tool.light.add.name', descKey: 'tool.light.add.desc', icon: '🚦', cost: g.config.roads.lightCost, createTool: (game) => new LightTool(game, true) });
    g.toolbar.add({ id: 'light:remove', category: 'roads', nameKey: 'tool.light.remove.name', descKey: 'tool.light.remove.desc', icon: '🚫', createTool: (game) => new LightTool(game, false) });
  },
};

export const zonesFeature: Feature = {
  id: 'zones',
  install(g) {
    for (const z of ZONES) g.zoneTypes.add({ ...z });
    g.addCategory({ id: 'zones', icon: '🏘️' });
    // отдельная кнопка на каждую плотность: малая / средняя / высокая
    const icons: Record<string, string[]> = { res: ['🏡', '🏘️', '🏙️'], com: ['🏪', '🏬', '🏢'], ind: ['🔧', '🏭', '💼'] };
    for (const z of g.zoneTypes.all()) {
      for (let n = 0; n < 3; n++) {
        g.toolbar.add({ id: `zone:${z.id}:${n}`, category: 'zones', nameKey: `density.${z.id}.${n}.name`, descKey: `density.${z.id}.${n}.desc`, icon: icons[z.id]?.[n] ?? z.icon, cost: z.cost, createTool: (game) => new ZoneTool(game, z.id, n) });
      }
    }
    g.toolbar.add({ id: 'zone:none', category: 'zones', nameKey: 'tool.dezone.name', descKey: 'tool.dezone.desc', icon: '🧹', hotkey: 'KeyZ', createTool: (game) => new ZoneTool(game, null) });
  },
};

const CATEGORY_ICONS: Record<string, string> = { power: '⚡', water: '💧', safety: '🚓', health: '🏥', education: '🎓', parks: '🌳', garbage: '🗑️', civic: '🏛️', landmarks: '🗽' };

export const natureFeature: Feature = {
  id: 'nature',
  install(g) {
    g.addSystem(new PropSystem());
    g.addCategory({ id: 'nature', icon: '🌲' });
    const modes: [string, string][] = [['single', '🌳'], ['brush', '🌲'], ['erase', '🧽']];
    for (const [mode, icon] of modes) {
      g.toolbar.add({ id: `prop:${mode}`, category: 'nature', nameKey: `tool.prop.${mode}.name`, descKey: `tool.prop.${mode}.desc`, icon, createTool: (game) => new NatureTool(game, mode as 'single' | 'brush' | 'erase') });
    }
  },
};

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
    g.addSystem(new FleetSystem());
    g.addSystem(new TaxiSystem());
    g.addSystem(new TransitSystem());
    g.addCategory({ id: 'transit', icon: '🚌' });
    g.toolbar.add({ id: 'stop', category: 'transit', nameKey: 'tool.stop.name', descKey: 'tool.stop.desc', icon: '🚏', cost: g.config.economy.stopCost, createTool: (game) => new StopTool(game) });
    g.toolbar.add({ id: 'route', category: 'transit', nameKey: 'tool.route.name', descKey: 'tool.route.desc', icon: '🧭', createTool: (game) => new RouteTool(game) });
  },
};

export const disastersFeature: Feature = {
  id: 'disasters',
  install(g) {
    g.addSystem(new DisasterSystem());
  },
};
