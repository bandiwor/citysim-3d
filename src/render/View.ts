/** Часть 3D-сцены, обновляемая каждый кадр. */
export interface View {
  /** realDt — реальное время, simDt — игровое (0 на паузе). */
  update?(realDt: number, simDt: number): void;
}
