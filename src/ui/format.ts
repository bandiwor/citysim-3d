import { t } from '../i18n';
import type { TimeSystem } from '../sim/TimeSystem';

/** Дата в формате «5 Янв 2025» на текущем языке. */
export function dateLabel(time: TimeSystem): string {
  return `${time.day} ${t(`month.${time.month}`)} ${time.year}`;
}
