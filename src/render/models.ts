import { BufferGeometry } from 'three';
import { Rng } from '../core/Rng';
import { CELL } from '../world/World';
import { GeomBuilder } from './GeomBuilder';

type ModelFactory = (rng: Rng) => BufferGeometry;

/**
 * Реестр процедурных моделей служб. Чтобы добавить модель новой службе —
 * зарегистрируйте фабрику: `serviceModels.set('mykey', () => ...)` и укажите `model: 'mykey'` в ServiceDef.
 */
export const serviceModels = new Map<string, ModelFactory>();

export { zoneModel, zoneVariantCount } from './zoneModels';

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

serviceModels.set('landfill', () => {
  const s = CELL * 3 - 1;
  const b = new GeomBuilder().box(s, 0.25, s, 0, 0, 0, 0x7a7058).cone(8, 5, -3, 0.2, -2, 0x6b6150, 9).cone(6, 4, 4, 0.2, 3, 0x756a55, 8).cone(4, 3, 4, 0.2, -5, 0x81765e, 8);
  for (const [x, z, c] of [[-4, 4, 0xc0504d], [-1, 6, 0x4a90c0], [6, 0, 0xd8c04a], [0, -6, 0x6aa86a], [-7, -3, 0xb0b0b0]] as [number, number, number][]) b.box(1.2, 0.5, 0.9, x, 0.25, z, c);
  b.box(3.6, 2.4, 3, 8, 0, 8, 0xb9bec3, { windows: true }).box(0.15, 1.6, s, -s / 2, 0, 0, 0x8a8f96).box(s, 1.6, 0.15, 0, 0, -s / 2, 0x8a8f96);
  return b.build();
});
serviceModels.set('incinerator', () =>
  new GeomBuilder()
    .box(9, 6, 7, 0, 0, 2.4, 0x8e949a, { windows: true })
    .box(5, 10, 5, -2, 0, -3, 0x6e747a)
    .cylinder(1.1, 1.4, 20, 2.4, 0, -4, 0x9a4a3a, 10)
    .cylinder(1.15, 1.15, 1.2, 2.4, 18, -4, 0x2e2e2e, 10)
    .box(9.4, 0.4, 7.4, 0, 6, 2.4, 0x5a5f65)
    .box(2.6, 3, 0.3, 2, 0, 6, 0xd8a21f)
    .build(),
);
serviceModels.set('cemetery', () => {
  const s = CELL * 3 - 1;
  const b = new GeomBuilder().box(s, 0.16, s, 0, 0, 0, 0x5f9c58).box(1.4, 0.2, s, 0, 0, 0, 0xcfc6a8).box(s, 0.2, 1.4, 0, 0, 0, 0xcfc6a8);
  for (let i = -2; i <= 2; i++) for (const z of [-6, -3.6, 3.6, 6]) {
    if (Math.abs(i) < 1) continue;
    b.box(0.9, 1.2, 0.3, i * 3.2, 0.1, z, 0xb7bcc0).box(0.5, 0.5, 0.32, i * 3.2, 0.9, z, 0xa6acb0);
  }
  b.box(3.2, 2.6, 2.6, 0, 0, -7, 0xd9d1c0, { windows: true }).box(3.6, 0.3, 3, 0, 2.6, -7, 0x6d625a);
  b.cylinder(0.2, 0.25, 4, -8, 0, 8, 0x5a4232, 5).cone(1.6, 4, -8, 1.6, 8, 0x2f6b3a, 7).cone(1.4, 3.6, 8, 1.2, 8, 0x2f6b3a, 7);
  return b.build();
});
serviceModels.set('crematorium', () =>
  new GeomBuilder()
    .box(8, 4, 6, 0, 0, 0, 0xcfc8bb, { windows: true })
    .box(8.4, 0.4, 6.4, 0, 4, 0, 0x6d625a)
    .cylinder(0.8, 1, 10, 2.6, 0, -1.6, 0x77706a, 8)
    .cylinder(0.85, 0.85, 0.8, 2.6, 10, -1.6, 0x2e2e2e, 8)
    .box(2, 2.8, 0.3, -1.6, 0, 3.1, 0x4a4036)
    .build(),
);
serviceModels.set('busdepot', () =>
  new GeomBuilder()
    .box(CELL * 2 - 1, 0.2, CELL * 2 - 1, 0, 0, 0, 0x595e63)
    .box(11, 5, 6, 0, 0.2, -4, 0xd7dde3, { windows: true })
    .box(11.4, 0.5, 6.4, 0, 5.2, -4, 0x2d7a4f)
    .box(2.6, 3.6, 0.3, -3.6, 0.2, -0.9, 0x2a3b57)
    .box(2.6, 3.6, 0.3, 0, 0.2, -0.9, 0x2a3b57)
    .box(2.6, 3.6, 0.3, 3.6, 0.2, -0.9, 0x2a3b57)
    .box(5, 0.1, 0.4, -3, 0.25, 5, 0xffffff)
    .box(5, 0.1, 0.4, 4, 0.25, 5, 0xffffff)
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

function wheels(b: GeomBuilder, pts: [number, number][], r = 0.4): void {
  for (const [x, z] of pts) b.cylinder(r, r, 0.3, x, 0, z, 0x151515, 8, { rx: Math.PI / 2 });
}

export function policeModel(): BufferGeometry {
  const b = new GeomBuilder().box(3.6, 0.8, 1.7, 0, 0.35, 0, 0xf2f4f7).box(1.7, 0.7, 1.45, -0.2, 1.1, 0, 0x30415e).box(0.9, 0.9, 0.12, 0, 0.4, 0.86, 0x2b58b8).box(0.9, 0.9, 0.12, 0, 0.4, -0.86, 0x2b58b8);
  b.box(0.3, 0.2, 0.5, -0.2, 1.8, 0.35, 0xd33a3a).box(0.3, 0.2, 0.5, -0.2, 1.8, -0.35, 0x3a6ad3);
  wheels(b, [[1.1, 0.85], [1.1, -0.85], [-1.1, 0.85], [-1.1, -0.85]], 0.36);
  return b.build();
}

export function garbageModel(): BufferGeometry {
  const b = new GeomBuilder().box(1.6, 1.8, 2, 2.1, 0.4, 0, 0xe8d24a).box(4.6, 2.3, 2.1, -1, 0.5, 0, 0x3f8f5a).box(4.6, 0.3, 2.2, -1, 2.8, 0, 0x2c6b42);
  wheels(b, [[2.1, 1], [2.1, -1], [-2, 1], [-2, -1], [-0.6, 1], [-0.6, -1]], 0.42);
  return b.build();
}

export function hearseModel(): BufferGeometry {
  const b = new GeomBuilder().box(4.4, 0.9, 1.7, 0, 0.35, 0, 0x1f2024).box(1.6, 0.7, 1.5, 1, 1.15, 0, 0x2a2c32).box(2.4, 0.85, 1.55, -1, 1.15, 0, 0xcfd3d8).box(2.4, 0.15, 0.4, -1, 2, 0, 0x9aa0a6);
  wheels(b, [[1.4, 0.86], [1.4, -0.86], [-1.4, 0.86], [-1.4, -0.86]], 0.36);
  return b.build();
}

export function treeModel(): BufferGeometry {
  return new GeomBuilder()
    .cylinder(0.2, 0.28, 1.4, 0, 0, 0, 0x6e4a2c, 5)
    .cone(1.3, 2.8, 0, 1.0, 0, 0x2f7d3b, 6)
    .cone(0.95, 2.2, 0, 2.5, 0, 0x3c9448, 6)
    .build();
}
