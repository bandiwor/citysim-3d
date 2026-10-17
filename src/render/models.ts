import { BufferGeometry } from 'three';
import { Rng } from '../core/Rng';
import { CELL } from '../world/World';
import { GeomBuilder } from './GeomBuilder';

const FLOOR = 3;

type ModelFactory = (rng: Rng) => BufferGeometry;

/**
 * Реестр процедурных моделей служб. Чтобы добавить модель новой службе —
 * зарегистрируйте фабрику: `serviceModels.set('mykey', () => ...)` и укажите `model: 'mykey'` в ServiceDef.
 */
export const serviceModels = new Map<string, ModelFactory>();

// ---------------- жилые / коммерческие / промышленные ----------------

export function zoneModel(zone: string, level: number, variant: number): BufferGeometry {
  const rng = new Rng(zone.charCodeAt(0) * 1000 + level * 37 + variant * 7919);
  const b = new GeomBuilder();
  const floors = (lo: number, hi: number): number => lo + Math.round((hi - lo) * (variant / 2));
  if (zone === 'res') {
    if (level === 1) {
      const f = floors(1, 2);
      const w = 4.6 + rng.range(0, 1.2);
      const d = 4.4 + rng.range(0, 1);
      b.box(w, f * FLOOR, d, 0, 0, 0, 0xffffff, { windows: true });
      b.roof(w + 0.8, d + 0.8, 2.4, 0, f * FLOOR, 0, 0xb4533c);
      b.box(2.4, 2.2, 2.4, w / 2 - 0.2, 0, d / 2 + 0.6, 0xf3efe6);
      b.box(0.7, 1.6, 0.7, -w / 4, f * FLOOR + 1.4, 0, 0x8a4a38);
    } else if (level === 2) {
      const f = floors(3, 5);
      b.box(6.2, f * FLOOR, 5.8, 0, 0, 0, 0xffffff, { windows: true });
      b.box(6.6, 0.4, 6.2, 0, f * FLOOR, 0, 0x9aa0a6);
      b.box(1.8, 1.4, 1.8, -1.6, f * FLOOR + 0.4, 1, 0xc9ccd0);
      b.box(6.4, 0.5, 1.2, 0, FLOOR, 3.4, 0xd7d2c4);
    } else {
      const f = floors(8, 14);
      b.box(7.2, FLOOR * 2, 7.2, 0, 0, 0, 0xe9e9e4, { windows: true });
      b.box(5.2, f * FLOOR, 5.2, 0, FLOOR * 2, 0, 0xffffff, { windows: true });
      b.box(5.6, 0.5, 5.6, 0, FLOOR * (f + 2), 0, 0x8d949b);
      b.box(2.2, 1.6, 2.2, 0.8, FLOOR * (f + 2) + 0.5, -0.5, 0xb9bec3);
      b.cylinder(0.12, 0.12, 4, -1.4, FLOOR * (f + 2) + 0.5, 1.2, 0xcc4444, 5);
    }
  } else if (zone === 'com') {
    if (level === 1) {
      const f = floors(1, 2);
      b.box(6.8, f * FLOOR + 0.6, 5.6, 0, 0, -0.4, 0xffffff, { windows: true });
      b.box(6.8, 0.3, 1.8, 0, 2.4, 2.9, 0xd9523b);
      b.box(2.4, 1.2, 0.2, 1.6, f * FLOOR + 0.8, 2.4, 0x2d78c8);
      b.box(1.4, 0.8, 1.4, -2, f * FLOOR + 0.6, -1, 0xb7babd);
    } else if (level === 2) {
      const f = floors(3, 5);
      b.box(7, FLOOR, 7, 0, 0, 0, 0xcfe3f2, { windows: true });
      b.box(6.2, f * FLOOR, 6.2, 0, FLOOR, 0, 0xffffff, { windows: true });
      b.box(6.6, 0.5, 6.6, 0, FLOOR * (f + 1), 0, 0x6e7a85);
      b.box(2.2, 1.2, 2.2, 1.4, FLOOR * (f + 1) + 0.5, 1, 0xaab3ba);
    } else {
      const f = floors(9, 14);
      b.box(7.4, FLOOR * 2, 7.4, 0, 0, 0, 0xcfe3f2, { windows: true });
      b.box(5.8, f * FLOOR, 5.8, 0, FLOOR * 2, 0, 0xe4f1fb, { windows: true });
      b.box(4.2, 2 * FLOOR, 4.2, 0, FLOOR * (f + 2), 0, 0xe4f1fb, { windows: true });
      b.cylinder(0.1, 0.25, 7, 0, FLOOR * (f + 4), 0, 0xd9d9d9, 5);
    }
  } else {
    if (level === 1) {
      b.box(6.8, 4, 5.8, 0, 0, 0, 0xd8dde3, { windows: true });
      b.box(7, 0.5, 6, 0, 4, 0, 0x7b8590);
      b.cylinder(0.6, 0.7, 6.5, -2.2, 4, -1.6, 0x9a5a48, 8);
      b.box(2.4, 2.4, 2.4, 2.2, 4.5, 1.4, 0xb8bec5);
    } else if (level === 2) {
      b.box(7, 4.5, 4.4, 0, 0, -1.4, 0xd0d6dd, { windows: true });
      b.box(4.4, 3.6, 3.2, -1.2, 0, 2.4, 0xc4cad1, { windows: true });
      b.box(7.2, 0.5, 4.6, 0, 4.5, -1.4, 0x6f7983);
      b.cylinder(0.55, 0.65, 8, 2.4, 4.5, -2.2, 0x9a5a48, 8);
      b.cylinder(0.55, 0.65, 6.5, 0.8, 4.5, -2.2, 0x9a5a48, 8);
      b.cylinder(1.1, 1.1, 3.2, 2.8, 0, 2.6, 0xe8e0c8, 10);
    } else {
      b.box(7, 5, 5.2, 0, 0, -1.2, 0xcdd3da, { windows: true });
      b.box(7.2, 0.5, 5.4, 0, 5, -1.2, 0x5f6973);
      b.cylinder(1.4, 1.4, 4.6, -2.4, 0, 2.6, 0xe8e0c8, 12);
      b.cylinder(1.4, 1.4, 4.6, 0.4, 0, 2.6, 0xe8e0c8, 12);
      b.cylinder(0.5, 0.6, 9, 2.4, 5, -2.6, 0x8d9aa6, 8);
      b.box(2, 1.4, 2, 2.4, 5.4, 1.4, 0xaab3ba);
    }
  }
  return b.build();
}

// ---------------- службы ----------------

serviceModels.set('police', () =>
  new GeomBuilder()
    .box(6.4, 5, 6.2, 0, 0, 0, 0xdde5f2, { windows: true })
    .box(6.6, 1, 6.4, 0, 4, 0, 0x2b58b8)
    .box(1.6, 2.4, 0.3, 0, 0, 3.2, 0x2a3b57)
    .box(0.6, 0.5, 0.6, -0.5, 5, 0, 0xd33a3a)
    .box(0.6, 0.5, 0.6, 0.5, 5, 0, 0x3a6ad3)
    .build(),
);
serviceModels.set('fire', () =>
  new GeomBuilder()
    .box(6.6, 4.6, 6.2, 0, 0, 0.3, 0xc83b2e, { windows: true })
    .box(1.7, 3.2, 0.3, -2.1, 0, 3.5, 0xf2f2f2)
    .box(1.7, 3.2, 0.3, 0, 0, 3.5, 0xf2f2f2)
    .box(1.7, 3.2, 0.3, 2.1, 0, 3.5, 0xf2f2f2)
    .box(2, 8, 2, 2.6, 0, -2.4, 0xa72f26)
    .box(6.8, 0.4, 6.4, 0, 4.6, 0.3, 0x8a8f96)
    .build(),
);
serviceModels.set('clinic', () =>
  new GeomBuilder()
    .box(6.4, 4.2, 6, 0, 0, 0, 0xf6f8fa, { windows: true })
    .box(6.6, 0.4, 6.2, 0, 4.2, 0, 0x9aa0a6)
    .box(2.4, 0.5, 0.8, 0, 4.6, 0, 0xd83a3a)
    .box(0.8, 0.5, 2.4, 0, 4.6, 0, 0xd83a3a)
    .build(),
);
serviceModels.set('hospital', () =>
  new GeomBuilder()
    .box(13, 9, 8, 0, 0, -2.4, 0xf6f8fa, { windows: true })
    .box(8, 6, 6, -2.4, 0, 4.4, 0xeef2f5, { windows: true })
    .box(13.4, 0.5, 8.4, 0, 9, -2.4, 0x9aa0a6)
    .box(4, 0.8, 1.2, 0, 9.5, -2.4, 0xd83a3a)
    .box(1.2, 0.8, 4, 0, 9.5, -2.4, 0xd83a3a)
    .box(2.6, 3.4, 0.4, 3, 0, 7.6, 0x33506e)
    .cylinder(2.6, 2.6, 0.3, 4, 9.5, 0.4, 0x3d6fb0, 14)
    .build(),
);
serviceModels.set('school', () =>
  new GeomBuilder()
    .box(13, 5.5, 6.4, 0, 0, -2.6, 0xc4654b, { windows: true })
    .box(6.4, 4.5, 4, -3.4, 0, 3.6, 0xb85c45, { windows: true })
    .box(13.4, 0.5, 6.8, 0, 5.5, -2.6, 0x8c4a38)
    .box(2.4, 9, 2.4, 4.4, 0, -2.6, 0xd6b99a)
    .cone(1.9, 2.4, 4.4, 9, -2.6, 0x8c4a38, 4)
    .cylinder(0.08, 0.08, 6, 5.2, 0, 5, 0xcfcfcf, 5)
    .box(1.6, 1, 0.1, 6, 4.8, 5, 0xd33a3a)
    .build(),
);
serviceModels.set('university', () =>
  new GeomBuilder()
    .box(20, 8, 9, 0, 0, -2, 0xe0d3b4, { windows: true })
    .box(7.4, 11, 7.4, 0, 0, 5, 0xd8c9a8, { windows: true })
    .box(7.8, 0.6, 7.8, 0, 11, 5, 0x7c6f58)
    .cylinder(2.6, 2.6, 1.6, 0, 11.6, 5, 0xd8c9a8, 14)
    .sphere(2.6, 0, 13.2, 5, 0x5d8a86)
    .box(6, 6, 6, -8.4, 0, 6, 0xcdbf9e, { windows: true })
    .box(6, 6, 6, 8.4, 0, 6, 0xcdbf9e, { windows: true })
    .build(),
);

const trees = (b: GeomBuilder, pts: [number, number][]): void => {
  for (const [x, z] of pts) {
    b.cylinder(0.25, 0.3, 1.6, x, 0, z, 0x7a5233, 6);
    b.cone(1.5, 3.2, x, 1.2, z, 0x3f9448, 7);
    b.cone(1.1, 2.4, x, 2.8, z, 0x4ca955, 7);
  }
};
serviceModels.set('park', () => {
  const b = new GeomBuilder().box(7.6, 0.18, 7.6, 0, 0, 0, 0x62b85a).box(1.2, 0.22, 7.6, 0, 0, 0, 0xd9cfae).box(7.6, 0.22, 1.2, 0, 0, 0, 0xd9cfae);
  trees(b, [[-2.5, -2.5], [2.6, -2.2], [-2.4, 2.6], [2.5, 2.6]]);
  b.box(1.4, 0.5, 0.5, 1.6, 0.2, 0.2, 0x8a6a45);
  return b.build();
});
serviceModels.set('bigpark', () => {
  const s = CELL * 2 - 0.5;
  const b = new GeomBuilder().box(s, 0.18, s, 0, 0, 0, 0x62b85a).box(2, 0.22, s, 0, 0, 0, 0xd9cfae).box(s, 0.22, 2, 0, 0, 0, 0xd9cfae);
  b.cylinder(2.8, 3, 0.7, 0, 0, 0, 0xcfd3d6, 16).cylinder(2.4, 2.4, 0.72, 0, 0, 0, 0x4aa3d8, 16).cylinder(0.3, 0.4, 2.4, 0, 0, 0, 0xcfd3d6, 8).sphere(0.7, 0, 2.2, 0, 0x7cc6ea);
  trees(b, [[-5.5, -5.5], [5.5, -5.2], [-5.4, 5.6], [5.6, 5.4], [-5.8, 0.2], [5.9, -0.1], [-0.2, -5.8], [0.2, 5.8]]);
  return b.build();
});
serviceModels.set('coal', () =>
  new GeomBuilder()
    .box(14, 7, 8, -2, 0, 4, 0x70767c, { windows: true })
    .box(9, 14, 9, -4, 0, -6, 0x5f656b)
    .cylinder(1.2, 1.4, 24, 6, 0, -7, 0xb34a3c, 10)
    .cylinder(1.2, 1.4, 20, 9, 0, -3, 0xb34a3c, 10)
    .cylinder(1.25, 1.25, 1.4, 6, 20, -7, 0x2e2e2e, 10)
    .cylinder(3.4, 4.8, 15, 7, 0, 6, 0xc7cacd, 16)
    .cone(3.4, 3, -9, 0, 8, 0x2b2b2b, 8)
    .build(),
);
serviceModels.set('wind', () => {
  const b = new GeomBuilder().cylinder(0.3, 0.55, 15, 0, 0, 0, 0xf2f4f6, 8).box(1.8, 0.9, 0.9, 0.3, 15, 0, 0xe0e4e8);
  for (let k = 0; k < 3; k++) b.box(0.18, 6.4, 0.5, 1.3, 15.45, 0, 0xffffff, { rx: (k * Math.PI * 2) / 3 + 0.4 });
  // лопасти смещены от центра ступицы
  return b.build();
});
serviceModels.set('solar', () => {
  const b = new GeomBuilder().box(CELL * 2 - 1, 0.2, CELL * 2 - 1, 0, 0, 0, 0x8d9296);
  for (const x of [-4.2, 0, 4.2]) for (const z of [-3.6, 3.6]) b.box(3.6, 0.15, 2.8, x, 1.0, z, 0x1f3f8a, { rx: -0.45 });
  return b.build();
});
serviceModels.set('watertower', () => {
  const b = new GeomBuilder();
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) b.cylinder(0.18, 0.18, 6.5, x, 0, z, 0x8f959b, 5);
  return b.cylinder(2.6, 2.6, 3.4, 0, 6.5, 0, 0x8fb7d9, 14).cone(2.8, 1.8, 0, 9.9, 0, 0x6c8fb0, 14).build();
});
serviceModels.set('waterplant', () =>
  new GeomBuilder()
    .box(8.4, 4.4, 5.2, -2.6, 0, 4.4, 0xdfe4e8, { windows: true })
    .cylinder(3.6, 3.6, 3.4, 3.8, 0, -4, 0x8fb7d9, 16)
    .cylinder(3.6, 3.6, 3.4, -3.8, 0, -4, 0x8fb7d9, 16)
    .cylinder(0.5, 0.5, 8, 5.6, 0, 4.6, 0x9aa6b0, 8)
    .build(),
);

/** Геометрия службы по ключу модели (fallback — серая коробка). */
export function serviceModel(key: string, w: number, h: number): BufferGeometry {
  const f = serviceModels.get(key);
  if (f) return f(new Rng(1));
  return new GeomBuilder().box(w * CELL - 1, 4, h * CELL - 1, 0, 0, 0, 0xb0b4b8).build();
}

// ---------------- транспорт и деревья ----------------

export function carModel(): BufferGeometry {
  const b = new GeomBuilder().box(3.4, 0.8, 1.6, 0, 0.35, 0, 0xffffff).box(1.7, 0.7, 1.4, -0.2, 1.1, 0, 0xc9d3dc);
  for (const [x, z] of [[1.05, 0.82], [1.05, -0.82], [-1.05, 0.82], [-1.05, -0.82]]) {
    b.cylinder(0.36, 0.36, 0.3, x, 0, z, 0x151515, 8, { rx: Math.PI / 2 });
  }
  return b.build();
}

export function truckModel(): BufferGeometry {
  const b = new GeomBuilder().box(1.6, 1.8, 1.9, 1.9, 0.4, 0, 0xc9d3dc).box(4.3, 2.3, 2, -0.9, 0.5, 0, 0xffffff);
  for (const [x, z] of [[1.9, 1], [1.9, -1], [-1.8, 1], [-1.8, -1], [-0.4, 1], [-0.4, -1]]) {
    b.cylinder(0.42, 0.42, 0.3, x, 0, z, 0x151515, 8, { rx: Math.PI / 2 });
  }
  return b.build();
}

export function busModel(): BufferGeometry {
  const b = new GeomBuilder().box(7.2, 2.5, 2.1, 0, 0.45, 0, 0xffffff);
  b.box(6.4, 0.8, 2.16, 0, 1.6, 0, 0x4a5a6a);
  for (const [x, z] of [[2.3, 1], [2.3, -1], [-2.3, 1], [-2.3, -1]]) {
    b.cylinder(0.45, 0.45, 0.3, x, 0, z, 0x151515, 8, { rx: Math.PI / 2 });
  }
  return b.build();
}

export function treeModel(): BufferGeometry {
  return new GeomBuilder()
    .cylinder(0.2, 0.28, 1.4, 0, 0, 0, 0x6e4a2c, 5)
    .cone(1.3, 2.8, 0, 1.0, 0, 0x2f7d3b, 6)
    .cone(0.95, 2.2, 0, 2.5, 0, 0x3c9448, 6)
    .build();
}
