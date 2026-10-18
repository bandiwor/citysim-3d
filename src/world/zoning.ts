import { CELL } from '../config/constants';
import type { GameConfig } from '../config/gameConfig';
import { obbDist, pointAtLength, pointSeg, yawOf, type Obb } from './geometry';
import type { RoadEdge } from './RoadGraph';
import { Terrain } from './Terrain';
import type { World } from './World';
import type { ZoneCell } from './ZoneGrid';

const HALF = CELL / 2;

function polyDist(e: RoadEdge, x: number, z: number): number {
  let d = Infinity;
  const p = { x, z };
  for (let i = 0; i < e.pts.length - 1; i++) d = Math.min(d, pointSeg(p, e.pts[i], e.pts[i + 1]).d);
  return d;
}

/** Можно ли разместить клетку с центром (x, z) рядом с ребром `own`. */
export function cellFits(world: World, cfg: GameConfig, x: number, z: number, rot: number, own?: RoadEdge): boolean {
  if (!world.inBounds(x, z, cfg.world.edgeMargin)) return false;
  const obb: Obb = { x, z, hw: HALF - 0.1, hd: HALF - 0.1, rot };
  if (world.footprintTerrain(obb) !== Terrain.Land) return false;
  for (const e of world.graph.edgesNear(x, z, CELL * 2 + 16)) {
    const need = e === own ? e.hw + HALF - 0.15 : e.hw + cfg.zoning.roadClearance;
    if (polyDist(e, x, z) < need) return false;
  }
  if (world.zones.near(x, z, cfg.zoning.cellMinGap).length) return false;
  for (const b of world.buildingsNear(x, z, CELL * 2)) {
    if (b.kind === 'service' && obbDist(world.obbOf(b), { x, z }) < HALF - 0.4) return false;
  }
  return true;
}

/** Порождает клетки зонирования вдоль ребра (обе стороны, depth рядов). Возвращает добавленные клетки. */
export function generateCells(world: World, edge: RoadEdge, cfg: GameConfig): ZoneCell[] {
  if (!edge.access) return [];
  const count = Math.floor(edge.len / CELL);
  if (count < 1) return [];
  const spacing = edge.len / count;
  const added: ZoneCell[] = [];
  for (let i = 0; i < count; i++) {
    const p = pointAtLength(edge.pts, edge.cum, (i + 0.5) * spacing);
    for (const side of [1, -1]) {
      const ox = -p.tz * side;
      const oz = p.tx * side;
      for (let row = 0; row < cfg.zoning.depth; row++) {
        const off = edge.hw + HALF + row * CELL;
        const x = p.x + ox * off;
        const z = p.z + oz * off;
        const rot = yawOf(-ox, -oz);
        if (!cellFits(world, cfg, x, z, rot, edge)) break;
        added.push(world.zones.add({ x, z, rot, tx: p.tx, tz: p.tz, nx: -ox, nz: -oz, row, zone: 0, density: 0, building: 0, edge: edge.id, s: (i + 0.5) * spacing }));
      }
    }
  }
  return added;
}

/** Убирает пустые клетки, перекрытые новой дорогой. */
export function pruneCellsNear(world: World, edge: RoadEdge, cfg: GameConfig): number {
  const seen = new Set<number>();
  let removed = 0;
  for (const p of edge.pts) {
    for (const c of world.zones.near(p.x, p.z, edge.hw + CELL * 1.5)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      if (c.building) continue;
      if (polyDist(edge, c.x, c.z) < edge.hw + cfg.zoning.roadClearance - 0.2) {
        world.zones.remove(c.id);
        removed++;
      }
    }
  }
  return removed;
}

/**
 * Пересчитывает ребро доступа каждой клетки. Возвращает клетки, оставшиеся без дороги
 * (их нужно удалить вместе со зданиями).
 */
export function refreshCellAccess(world: World, cfg: GameConfig): ZoneCell[] {
  const orphans: ZoneCell[] = [];
  const reach = 12 + cfg.zoning.depth * CELL + cfg.zoning.accessSlack;
  for (const c of world.zones.list()) {
    const hit = world.graph.nearest(c.x, c.z, reach, (e) => e.access);
    if (hit && hit.d <= hit.edge.hw + cfg.zoning.depth * CELL + cfg.zoning.accessSlack) {
      c.edge = hit.edge.id;
      c.s = hit.s;
    } else orphans.push(c);
  }
  return orphans;
}
