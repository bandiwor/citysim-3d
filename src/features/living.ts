import type { Feature } from '../core/System';
import { ResourceSystem } from '../sim/ResourceSystem';
import { TourismSystem } from '../sim/TourismSystem';
import { TradeSystem } from '../sim/TradeSystem';
import { WeatherSystem } from '../sim/WeatherSystem';
import { registerResourceOverlay } from './overlays';

/** Сезоны и погода: снег, дождь, жара, туман; влияние на спрос, пожары, туризм. */
export const weatherFeature: Feature = {
  id: 'weather',
  install(g) {
    g.addSystem(new WeatherSystem());
  },
};

/** Соседние города: выезды на краю карты, импорт и экспорт энергии, воды и сырья. */
export const tradeFeature: Feature = {
  id: 'trade',
  install(g) {
    g.addSystem(new TradeSystem());
  },
};

/** Туризм: достопримечательности привлекают гостей, отели их принимают. */
export const tourismFeature: Feature = {
  id: 'tourism',
  install(g) {
    g.addSystem(new TourismSystem());
  },
};

/** Природные ресурсы и специализированная промышленность (фермы, лесопилки, шахты, нефть). */
export const resourcesFeature: Feature = {
  id: 'resources',
  install(g) {
    g.addSystem(new ResourceSystem());
    registerResourceOverlay(g);
  },
};
