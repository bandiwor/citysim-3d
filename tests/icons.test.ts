import { describe, expect, it } from 'vitest';
import { hasIcon } from '../src/ui/icons';
import { TOOL_ICONS, UI_ICONS } from '../src/ui/icons/map';
import { createGame } from './helpers';

describe('SVG-иконки', () => {
  it('у каждого инструмента и раздела панели строительства есть своя иконка', () => {
    const g = createGame();
    const ids = [...g.toolbar.all().map((i) => i.id), ...g.toolbar.all().map((i) => i.category)];
    const missing = ids.filter((id) => !TOOL_ICONS[id] || !hasIcon(TOOL_ICONS[id]));
    expect(missing).toEqual([]);
  });

  it('все имена в таблицах указывают на существующие файлы', () => {
    const names: string[] = [...Object.values(TOOL_ICONS)];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') names.push(v);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(UI_ICONS);
    expect(names.filter((n) => !hasIcon(n))).toEqual([]);
  });
});
