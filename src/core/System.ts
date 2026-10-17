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
}

/** «Фича» — пакет данных, систем, инструментов и оверлеев, который подключается одной строкой. */
export interface Feature {
  readonly id: string;
  install(game: Game): void;
}
