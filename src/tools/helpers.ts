import type { Cell } from '../core/types';

export function rectCells(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) {
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) out.push({ x, y });
  }
  return out;
}

/** Прямая вдоль доминирующей оси от a к b. */
export function lineCells(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
    const s = Math.sign(b.x - a.x) || 1;
    for (let x = a.x; x !== b.x + s; x += s) out.push({ x, y: a.y });
  } else {
    const s = Math.sign(b.y - a.y) || 1;
    for (let y = a.y; y !== b.y + s; y += s) out.push({ x: a.x, y });
  }
  return out;
}
