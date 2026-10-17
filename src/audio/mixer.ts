import { clamp, smoothstep } from '../core/Rng';

/** Состояние мира вокруг камеры, от которого зависит звуковая картина. */
export interface AmbientState {
  /** расстояние камеры до земли */
  zoom: number;
  /** зданий вокруг точки обзора */
  buildingsNear: number;
  vehiclesNear: number;
  industryNear: number;
  /** доля воды вокруг 0..1 */
  waterNear: number;
  /** относительная скорость трафика 0..1 */
  trafficFlow: number;
  /** ночь 0..1 */
  night: number;
  fires: number;
  /** множитель скорости игры (0 — пауза) */
  speed: number;
  /** слышимые источники особых зданий (вес = близость): ветряки, механизмы, чайки, фонтаны, дети */
  sources?: Partial<Record<SoundSource, number>>;
  /** активные тревоги: ограбления */
  alarms?: number;
}

export const SOUND_SOURCES = ['turbine', 'machinery', 'gulls', 'fountain', 'kids'] as const;
export type SoundSource = (typeof SOUND_SOURCES)[number];

export const AMBIENT_LAYERS = ['city', 'traffic', 'industry', 'wind', 'birds', 'crickets', 'water', 'siren', 'turbine', 'machinery', 'fountain', 'gulls', 'kids'] as const;
export type AmbientLayer = (typeof AMBIENT_LAYERS)[number];
export type AmbientTargets = Record<AmbientLayer, number>;

export interface MixParams {
  /** расстояние камеры, при котором «детальные» звуки уже не слышны */
  farZoom: number;
  nearZoom: number;
}

export const defaultMixParams: MixParams = { farZoom: 420, nearZoom: 50 };

/**
 * Целевая громкость слоёв эмбиента 0..1 по состоянию мира: чем ближе камера и больше объектов рядом,
 * тем громче город, машины и заводы; на окраинах — ветер, птицы днём и сверчки ночью.
 */
export function computeMix(s: AmbientState, p: MixParams = defaultMixParams): AmbientTargets {
  const close = 1 - smoothstep(p.nearZoom, p.farZoom, s.zoom);
  const urban = clamp(s.buildingsNear / 45, 0, 1);
  const wild = 1 - clamp(s.buildingsNear / 60, 0, 1);
  const pause = s.speed === 0 ? 0.35 : 1;
  const out: AmbientTargets = {
    city: clamp(urban * (0.25 + 0.75 * close) * (1 - 0.35 * s.night), 0, 1),
    traffic: clamp((s.vehiclesNear / 25) * (0.15 + 0.85 * close) * (1 + (1 - s.trafficFlow) * 0.5), 0, 1),
    industry: clamp((s.industryNear / 6) * (0.2 + 0.8 * close), 0, 1),
    wind: clamp(wild * (0.25 + 0.75 * close) + 0.05, 0, 1),
    birds: clamp(wild * (1 - s.night) * close, 0, 1),
    crickets: clamp(wild * s.night * (0.3 + 0.7 * close), 0, 1),
    water: clamp(s.waterNear * (0.3 + 0.7 * close), 0, 1),
    siren: s.fires > 0 || (s.alarms ?? 0) > 0 ? clamp(0.4 + 0.6 * close, 0, 1) : 0,
    turbine: clamp((s.sources?.turbine ?? 0) * (0.25 + 0.75 * close), 0, 1),
    machinery: clamp(((s.sources?.machinery ?? 0) / 1.5) * (0.2 + 0.8 * close), 0, 1),
    fountain: clamp((s.sources?.fountain ?? 0) * (0.2 + 0.8 * close), 0, 1),
    gulls: clamp((s.sources?.gulls ?? 0) * close, 0, 1),
    kids: clamp((s.sources?.kids ?? 0) * (1 - s.night) * close, 0, 1),
  };
  for (const k of AMBIENT_LAYERS) if (k !== 'siren') out[k] *= pause;
  return out;
}
