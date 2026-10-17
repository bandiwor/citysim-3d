import { t } from '../i18n';
import type { TimeSystem } from '../sim/TimeSystem';

/** Дата в формате «5 Янв 2025» на текущем языке. */
export function dateLabel(time: TimeSystem): string {
  return `${time.day} ${t(`month.${time.month}`)} ${time.year}`;
}

/** Время суток 0..1 (0.5 — полдень) → «ЧЧ:ММ». */
export function clockLabel(tod: number): string {
  const total = Math.floor(tod * 24 * 60) % (24 * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Значок фазы дня: рассвет, день, закат, ночь. */
export function phaseIcon(tod: number): string {
  const h = tod * 24;
  if (h >= 5 && h < 8) return '🌅';
  if (h >= 8 && h < 17.5) return '☀️';
  if (h >= 17.5 && h < 21) return '🌇';
  return '🌙';
}
