import type { Game } from './Game';

/**
 * Симуляционная механика. Регистрируется в Game.addSystem(), получает update каждый кадр.
 *  - dt     — игровое время (0 на паузе, масштабируется скоростью);
 *  - realDt — реальное время кадра (для троттлинга пересчётов, работающих и на паузе).
 */
export interface System {
  readonly id: string;
  /** Порядок обновления (меньше — раньше). */
  readonly order: number;
  init?(game: Game): void;
  update?(dt: number, realDt: number): void;
  dispose?(): void;
  /** состояние механики для сохранения (JSON); не задано — механика ничего не хранит */
  saveState?(): unknown;
  /** восстановление из сохранения (вызывается после init, в первом кадре загруженной игры) */
  loadState?(data: unknown): void;
}

/** «Фича» — пакет данных, систем, инструментов и оверлеев, который подключается одной строкой. */
export interface Feature {
  readonly id: string;
  install(game: Game): void;
}
