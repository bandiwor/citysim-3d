import type { GameConfig } from '../config/gameConfig';
import type { RoadGraph, RoadNode } from '../world/RoadGraph';

export type LightState = 'green' | 'yellow' | 'red';

/**
 * Разбивает подходы к перекрёстку на две фазы светофора по порядку вокруг узла
 * (противоположные дороги попадают в одну группу). Возвращает id ребра → группа 0/1.
 */
export function lightGroups(graph: RoadGraph, node: RoadNode): Map<number, 0 | 1> {
  const arms = node.edges
    .map((id) => {
      const e = graph.edges.get(id)!;
      const p = e.a === node.id ? e.pts[Math.min(1, e.pts.length - 1)] : e.pts[Math.max(0, e.pts.length - 2)];
      return { id, ang: Math.atan2(p.z - node.z, p.x - node.x) };
    })
    .sort((a, b) => a.ang - b.ang);
  const out = new Map<number, 0 | 1>();
  arms.forEach((a, i) => out.set(a.id, (i % 2) as 0 | 1));
  return out;
}

/** Состояние сигнала для группы в момент времени t (секунды игрового времени). */
export function lightState(group: 0 | 1, t: number, cfg: GameConfig['roads']): LightState {
  const half = cfg.lightCycle / 2;
  const phase = t % cfg.lightCycle;
  const active: 0 | 1 = phase < half ? 0 : 1;
  if (active !== group) return 'red';
  const into = phase % half;
  return into > half - cfg.lightYellow ? 'yellow' : 'green';
}
