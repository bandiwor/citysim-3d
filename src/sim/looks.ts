/** Внешность человека по зерну: детерминированно, чтобы разные игроки видели одних и тех же людей, а симуляция — не знала про рендер. */
export interface Look {
  /** 0 — взрослый, 1 — ребёнок, 2 — пожилой */
  kind: 0 | 1 | 2;
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  /** 0 — нет, 1 — кепка, 2 — шапка/панама */
  hat: 0 | 1 | 2;
  hatColor: number;
  bag: boolean;
  /** 0 — нет волос */
  bald: boolean;
  /** рост относительно нормы */
  height: number;
  /** множитель скорости ходьбы */
  speed: number;
}

const SKIN = [0xf1c9a5, 0xe0ac86, 0xc68a62, 0x9b6a47, 0x6e4a32, 0xf7d8c0];
const HAIR = [0x2a1d14, 0x4a3020, 0x7a5232, 0xb98a4a, 0xd8c08a, 0x8c8c8c, 0xe8e8e8, 0x1a1a1a, 0xa23b2a];
const SHIRT = [0xc8553d, 0x3d7ec8, 0x4fa36a, 0xd8b04a, 0x8a5bb0, 0x2e2e36, 0xe0e0e0, 0xd07a9a, 0x5a6a7a, 0xf08a3c, 0x2f9f9f, 0x7a3b3b];
const PANTS = [0x2b2f3a, 0x3a4a6a, 0x5a4a3a, 0x6a6a6a, 0x222222, 0x4a5a4a, 0x7a6a55];

/** Простой целочисленный хэш → [0, 1). */
function rnd(seed: number, k: number): number {
  let h = (seed ^ (k * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const pick = <T>(arr: T[], r: number): T => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

/** Внешность по зерну; турист — в панаме, яркой рубашке и с рюкзаком. */
export function lookOf(seed: number, tourist = false): Look {
  const r = (k: number): number => rnd(seed, k);
  const k = r(0);
  const kind: Look['kind'] = k < 0.14 ? 1 : k < 0.3 ? 2 : 0;
  const hatR = r(7);
  return {
    kind,
    skin: pick(SKIN, r(1)),
    hair: kind === 2 && r(8) < 0.7 ? pick([0xd8d8d8, 0x9a9a9a, 0xf0f0f0], r(9)) : pick(HAIR, r(2)),
    shirt: pick(SHIRT, r(3)),
    pants: pick(PANTS, r(4)),
    hat: hatR < 0.16 ? 1 : hatR < 0.26 ? 2 : 0,
    hatColor: pick(SHIRT, r(5)),
    bag: kind !== 2 && r(6) < (kind === 1 ? 0.6 : 0.3),
    bald: kind !== 1 && r(10) < 0.08,
    height: kind === 1 ? 0.62 + r(11) * 0.1 : kind === 2 ? 0.92 + r(11) * 0.06 : 0.94 + r(11) * 0.14,
    speed: kind === 1 ? 1.1 : kind === 2 ? 0.7 : 1,
    ...(tourist ? { hat: 2 as const, hatColor: pick([0xf2e3b0, 0xffffff, 0xf2c230], r(12)), bag: true, shirt: pick([0xff8a3c, 0x3cc8d8, 0xf2c230, 0xff6fa0, 0x6fd06a], r(13)), speed: 0.75 } : {}),
  };
}
