import { CELL } from '../config/constants';
import { GeomBuilder } from './GeomBuilder';
import { serviceModels, upgradeParts } from './models';

/* Новые модели служб и детали улучшений. Подключается побочным эффектом из BuildingView. */

const tree = (b: GeomBuilder, x: number, z: number): void => {
  b.cylinder(0.22, 0.28, 1.4, x, 0, z, 0x7a5233, 6).cone(1.3, 2.8, x, 1.0, z, 0x3f9448, 7);
};

// ---------------- новые службы ----------------

serviceModels.set('gas', () =>
  new GeomBuilder()
    .box(CELL * 2 - 1, 0.2, CELL * 2 - 1, 0, 0, 0, 0x7d8286)
    .box(9, 5, 5, -2, 0.2, 3, 0xc9ced3, { windows: true })
    .cylinder(2.2, 2.2, 6, 4.4, 0.2, 4, 0xe6e9ec, 14)
    .cylinder(2.2, 2.2, 6, 4.4, 0.2, -3.6, 0xe6e9ec, 14)
    .cylinder(0.9, 1.1, 13, -4.8, 0.2, -4.6, 0x8a8f96, 10)
    .box(1, 0.6, 9, 0, 1.2, -2.4, 0x6b7076)
    .build(),
);
serviceModels.set('pumpstation', () =>
  new GeomBuilder()
    .box(5.4, 3.2, 4.6, 0, 0, 0, 0xcfd6dc, { windows: true })
    .box(5.8, 0.4, 5, 0, 3.2, 0, 0x4a6f93)
    .cylinder(0.5, 0.5, 5, -2.2, 3.4, 0, 0x7aa3c8, 8)
    .cylinder(0.35, 0.35, 3, 2.5, 0, 1.4, 0x5f8fb8, 8, { rz: Math.PI / 2 })
    .build(),
);
serviceModels.set('policehq', () =>
  new GeomBuilder()
    .box(11, 7, 8, 0, 0, -2, 0xdde5f2, { windows: true })
    // синий пояс-карниз выше крыши корпуса (раньше верх совпадал с крышей и мерцал)
    .box(11.4, 1.2, 8.4, 0, 6, -2, 0x2b58b8)
    .box(10.6, 0.08, 7.6, 0, 7, -2, 0x8d949b)
    .box(5, 4.4, 4, 0, 0, 4.4, 0xc9d4e6, { windows: true })
    .box(2.2, 3, 0.3, 0, 0, 6.5, 0x2a3b57)
    .cylinder(0.12, 0.12, 6, 4.6, 7, -2, 0xcfcfcf, 5)
    .box(1.4, 0.9, 0.1, 5.4, 12, -2, 0x2b58b8)
    .build(),
);
serviceModels.set('firehq', () =>
  new GeomBuilder()
    .box(12, 5.6, 7, 0, 0, -2.2, 0xc83b2e, { windows: true })
    .box(3, 4.2, 0.3, -3.6, 0, 1.4, 0xf2f2f2)
    .box(3, 4.2, 0.3, 0, 0, 1.4, 0xf2f2f2)
    .box(3, 4.2, 0.3, 3.6, 0, 1.4, 0xf2f2f2)
    .box(12.4, 0.5, 7.4, 0, 5.6, -2.2, 0x8a8f96)
    .box(3, 12, 3, 5, 0, -5, 0xa72f26)
    .box(3.4, 0.6, 3.4, 5, 12, -5, 0x8a8f96)
    .build(),
);
serviceModels.set('library', () =>
  new GeomBuilder()
    .box(11, 5, 7, 0, 0, -1.4, 0xe4d9c3, { windows: true })
    .box(11.4, 0.5, 7.4, 0, 5, -1.4, 0x6d625a)
    .box(7, 0.4, 2.4, 0, 3.6, 3.2, 0xdad2bd)
    .cylinder(0.35, 0.4, 3.6, -2.6, 0, 3.4, 0xefe9da, 8)
    .cylinder(0.35, 0.4, 3.6, 0, 0, 3.4, 0xefe9da, 8)
    .cylinder(0.35, 0.4, 3.6, 2.6, 0, 3.4, 0xefe9da, 8)
    .sphere(1.6, 0, 5.4, -1.4, 0x4f8c8a)
    .build(),
);
serviceModels.set('plaza', () => {
  const b = new GeomBuilder().box(7.4, 0.2, 7.4, 0, 0, 0, 0xd9cfae).box(6.2, 0.22, 6.2, 0, 0, 0, 0xcdbf9c);
  b.cylinder(2, 2.2, 0.6, 0, 0.2, 0, 0xcfd3d6, 14).cylinder(1.7, 1.7, 0.62, 0, 0.2, 0, 0x4aa3d8, 14).cylinder(0.22, 0.3, 1.6, 0, 0.2, 0, 0xcfd3d6, 8);
  for (const [x, z] of [[-3, -3], [3, 3]]) tree(b, x, z);
  b.box(1.4, 0.45, 0.5, 2.8, 0.2, -2.6, 0x8a6a45).box(1.4, 0.45, 0.5, -2.8, 0.2, 2.6, 0x8a6a45);
  return b.build();
});
serviceModels.set('stadium', () => {
  const s = CELL * 3 - 1;
  const b = new GeomBuilder().box(s, 0.2, s, 0, 0, 0, 0x8f959b);
  b.cylinder(10.4, 11, 5, 0, 0.2, 0, 0xd8dde2, 24).cylinder(8.4, 8.4, 5.2, 0, 0.2, 0, 0x7a8087, 24).cylinder(7.6, 7.6, 5.3, 0, 0.1, 0, 0x4ea04d, 24);
  b.box(10, 0.1, 0.2, 0, 5.4, 0, 0xffffff).box(0.2, 0.1, 6, 0, 5.4, 0, 0xffffff).box(3, 3.2, 0.3, 0, 0.2, 11.2, 0x33506e);
  for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) b.cylinder(0.2, 0.25, 10, x, 0, z, 0xb7bcc0, 6).box(1.6, 0.6, 0.6, x, 10, z, 0xfff3b0);
  return b.build();
});
serviceModels.set('recycling', () =>
  new GeomBuilder()
    .box(CELL * 2 - 1, 0.2, CELL * 2 - 1, 0, 0, 0, 0x777c80)
    .box(10, 5, 6, -1.6, 0.2, -3.4, 0xd7e2d6, { windows: true })
    .box(10.4, 0.5, 6.4, -1.6, 5.2, -3.4, 0x2f7d4f)
    .box(1.4, 1, 1.4, 4.8, 0.2, 4.4, 0x2f9f5f)
    .box(1.4, 1, 1.4, 6.4, 0.2, 4.4, 0x2f6fbf)
    .box(1.4, 1, 1.4, 3.2, 0.2, 4.4, 0xd8b042)
    .box(8, 0.4, 1.2, -3, 0.2, 3.2, 0x5a5f65)
    .cylinder(0.3, 0.3, 4, 5.6, 5.4, -3.4, 0x8a8f96, 6)
    .build(),
);

serviceModels.set('townhall', () =>
  new GeomBuilder()
    .box(CELL * 2 - 1, 0.2, CELL * 2 - 1, 0, 0, 0, 0xb9b6ad)
    .box(12, 6, 6.4, 0, 0.2, -2.4, 0xeae3d2, { windows: true })
    .box(12.4, 0.5, 6.8, 0, 6.2, -2.4, 0x7a6f60)
    .box(8, 0.4, 2.4, 0, 5.4, 2.8, 0xd9d1be)
    .cylinder(0.3, 0.34, 5.2, -3.4, 0.2, 3.4, 0xf3eee0, 8)
    .cylinder(0.3, 0.34, 5.2, -1.1, 0.2, 3.4, 0xf3eee0, 8)
    .cylinder(0.3, 0.34, 5.2, 1.1, 0.2, 3.4, 0xf3eee0, 8)
    .cylinder(0.3, 0.34, 5.2, 3.4, 0.2, 3.4, 0xf3eee0, 8)
    .box(3, 7, 3, 0, 6.7, -2.4, 0xeae3d2)
    .cone(2.4, 3.4, 0, 13.7, -2.4, 0x5b7f8a, 4)
    .cylinder(0.9, 0.9, 0.2, 0, 10, -0.8, 0xf6f6f6, 14, { rx: Math.PI / 2 })
    .build(),
);
serviceModels.set('monument', () => {
  const b = new GeomBuilder().box(CELL * 2 - 1, 0.2, CELL * 2 - 1, 0, 0, 0, 0xcfc7b0);
  b.cylinder(6.2, 6.6, 0.5, 0, 0.2, 0, 0xd9d3c3, 20).cylinder(4.6, 5, 0.5, 0, 0.7, 0, 0xe3ddce, 20).cylinder(3.2, 3.6, 0.6, 0, 1.2, 0, 0xece7d9, 16);
  b.box(2.4, 8, 2.4, 0, 1.8, 0, 0xeee9dc).cone(1.9, 3, 0, 9.8, 0, 0xd6b24a, 4).sphere(0.6, 0, 12.8, 0, 0xffd966);
  for (const [x, z] of [[-6.2, -6.2], [6.2, -6.2], [-6.2, 6.2], [6.2, 6.2]]) {
    b.cylinder(0.25, 0.3, 1.6, x, 0.2, z, 0x7a5233, 6).sphere(1.1, x, 1.2, z, 0x4ca955);
  }
  return b.build();
});


// ---------------- ещё службы ----------------

const slab = (b: GeomBuilder, cells: number, color = 0x8f959b): GeomBuilder => b.box(CELL * cells - 1, 0.2, CELL * cells - 1, 0, 0, 0, color);

serviceModels.set('nuclear', () => {
  const b = slab(new GeomBuilder(), 3, 0x7d8286);
  // градирни-гиперболоиды (конус с узкой «талией» из двух усечённых конусов) и реакторный купол
  for (const [x, z] of [[-6, -5], [5, -6]]) b.cylinder(3.2, 4.6, 7, x, 0.2, z, 0xd8dadc, 20).cylinder(3.6, 3.2, 6, x, 7.2, z, 0xd8dadc, 20);
  b.sphere(4.4, 3, 0.2, 5, 0xe6e9ec).cylinder(4.4, 4.4, 4, 3, 0.2, 5, 0xe6e9ec, 20).box(10, 5.5, 5, -4.5, 0.2, 6.5, 0xb9bfc6, { windows: true }).box(10.4, 0.5, 5.4, -4.5, 5.7, 6.5, 0x5f656b);
  b.cylinder(0.5, 0.6, 14, 9, 0.2, -2, 0xb34a3c, 8);
  return b.build();
});
serviceModels.set('geothermal', () => {
  const b = slab(new GeomBuilder(), 2, 0x8a8f94);
  b.box(8, 4.4, 5, -2, 0.2, 3.4, 0xd7dde3, { windows: true }).box(8.4, 0.4, 5.4, -2, 4.6, 3.4, 0x5f656b);
  b.cylinder(1.4, 1.8, 3.4, 4.4, 0.2, -3.6, 0xb9bfc6, 10).cylinder(0.3, 0.3, 9, -3.6, 0.2, -4.4, 0xcfd3d6, 8).box(8, 0.5, 0.5, 0.2, 1.6, -4.4, 0xcfd3d6).sphere(1.3, 4.4, 3.6, -3.6, 0xe56b3a);
  return b.build();
});
serviceModels.set('windfarm', () => {
  const b = slab(new GeomBuilder(), 3, 0x76a070);
  for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) b.cylinder(0.25, 0.45, 12, x, 0.2, z, 0xf2f4f6, 8).box(1.4, 0.8, 0.8, x + 0.3, 12, z, 0xe0e4e8).sphere(0.4, x + 1, 12, z, 0xcfd4d9);
  b.box(4, 2.6, 3, 0, 0.2, 0, 0xd7dde3, { windows: true });
  return b.build();
});
serviceModels.set('well', () =>
  new GeomBuilder()
    .box(5, 0.2, 5, 0, 0, 0, 0x9aa09a)
    .cylinder(1, 1.1, 1.2, 0, 0.2, 0, 0x8a8f96, 12)
    .cylinder(0.12, 0.12, 2.8, -0.9, 0.2, 0, 0x6e5a40, 6)
    .cylinder(0.12, 0.12, 2.8, 0.9, 0.2, 0, 0x6e5a40, 6)
    .prism(3, 2.6, 1.2, 0, 3, 0, 0x8a4a38)
    .box(2.4, 1.8, 1.8, 0, 0.2, 2, 0xd7cfc0, { windows: true })
    .build(),
);
serviceModels.set('desalination', () => {
  const b = slab(new GeomBuilder(), 3, 0x7f868b);
  b.box(14, 4.4, 6, 0, 0.2, -5, 0xdbe3e8, { windows: true }).box(14.4, 0.5, 6.4, 0, 4.6, -5, 0x4a6f93);
  for (let i = 0; i < 4; i++) b.cylinder(1.1, 1.1, 8, -5.4 + i * 3.6, 0.2, 3, 0xb9d3e8, 12, { rz: Math.PI / 2 });
  b.cylinder(3, 3, 3, 7, 0.2, 5.5, 0x8fb7d9, 14).box(14, 0.4, 0.4, 0, 3.4, 8, 0x8a8f96);
  return b.build();
});
serviceModels.set('policepost', () =>
  new GeomBuilder().box(4.4, 3.2, 4, 0, 0, 0, 0xdde5f2, { windows: true }).box(4.8, 0.6, 4.4, 0, 3.2, 0, 0x2b58b8).box(1.2, 2, 0.2, 0, 0, 2.1, 0x2a3b57).box(0.6, 0.5, 0.6, 0, 3.8, 0, 0x3a6ad3).build(),
);
serviceModels.set('firepost', () =>
  new GeomBuilder().box(4.6, 3.4, 4.4, 0, 0, 0, 0xc83b2e, { windows: true }).box(3, 2.6, 0.3, 0, 0, 2.3, 0xf2f2f2).box(4.8, 0.5, 4.6, 0, 3.4, 0, 0x8a8f96).box(1.2, 5, 1.2, 1.6, 0, -1.4, 0xa72f26).build(),
);
serviceModels.set('firehelidepot', () => {
  const b = slab(new GeomBuilder(), 2, 0x6e747a);
  b.box(8, 4.4, 5, -2.6, 0.2, -3.6, 0xc83b2e, { windows: true }).box(8.4, 0.5, 5.4, -2.6, 4.6, -3.6, 0x8a8f96).box(5, 3.2, 0.3, -2.6, 0.2, -1, 0xf2f2f2);
  b.cylinder(3.4, 3.4, 0.25, 3.4, 0.2, 3.4, 0x575c62, 18).box(3, 0.08, 0.5, 3.4, 0.45, 3.4, 0xffffff).box(0.5, 0.08, 3, 3.4, 0.45, 3.4, 0xffffff);
  b.box(1.6, 1.4, 1.6, 3.4, 0.5, 3.4, 0xc83b2e).box(0.3, 0.6, 3, 3.4, 1.8, 3.4, 0xc83b2e);
  return b.build();
});
serviceModels.set('pharmacy', () =>
  new GeomBuilder().box(5, 3, 4.4, 0, 0, 0, 0xf1f6f2, { windows: true }).box(5.4, 0.4, 4.8, 0, 3, 0, 0x4fae6a).box(1.8, 0.4, 0.2, 0, 3.4, 2.2, 0x2f9f5f).box(0.4, 1.8, 0.2, 0, 2.7, 2.2, 0x2f9f5f).box(1.4, 0.15, 1.4, 0, 2.2, 2.7, 0xe56b3a).build(),
);
serviceModels.set('medcenter', () =>
  new GeomBuilder()
    .box(10, 5, 6.4, 0, 0, -1.4, 0xf6f8fa, { windows: true })
    .box(10.4, 0.5, 6.8, 0, 5, -1.4, 0x9aa0a6)
    .box(5, 3.4, 3, -1.6, 0, 3.8, 0xe8eef2, { windows: true })
    .box(2.4, 0.5, 0.5, 3, 5.5, -1.4, 0xd83a3a)
    .box(0.5, 0.5, 2.4, 3, 5.5, -1.4, 0xd83a3a)
    .box(2.4, 2.8, 0.3, 3.4, 0, 2, 0x33506e)
    .build(),
);
serviceModels.set('kindergarten', () => {
  const b = new GeomBuilder().box(5.4, 2.8, 4, 0, 0, -0.8, 0xf2c14e, { windows: true }).prism(6, 4.6, 1.4, 0, 2.8, -0.8, 0xd9523b).box(1.4, 2, 0.2, 0, 0, 1.3, 0x4a90d9);
  b.sphere(0.5, -2.2, 0, 2.6, 0x4ca955).box(1.4, 0.1, 1.4, 1.8, 0, 2.5, 0xd9cfae).box(0.1, 1.2, 0.1, 1.2, 0, 2.5, 0xd33a3a).box(0.1, 1.2, 0.1, 2.4, 0, 2.5, 0xd33a3a).box(1.3, 0.1, 0.1, 1.8, 1.1, 2.5, 0xd33a3a);
  return b.build();
});
serviceModels.set('highschool', () =>
  new GeomBuilder()
    .box(CELL * 2 - 1, 0.2, CELL * 2 - 1, 0, 0, 0, 0x8f959b)
    .box(11, 5.4, 4.6, 0, 0.2, -4.4, 0xc4654b, { windows: true })
    .box(4.6, 5.4, 6, 4.2, 0.2, 1, 0xb85c45, { windows: true })
    .box(11.4, 0.5, 5, 0, 5.6, -4.4, 0x8c4a38)
    .box(4.8, 0.5, 6.4, 4.2, 5.6, 1, 0x8c4a38)
    .box(6, 0.1, 4, -4.4, 0.2, 3.4, 0x4ea04d)
    .box(6, 0.12, 0.15, -4.4, 0.25, 3.4, 0xffffff)
    .build(),
);
serviceModels.set('college', () =>
  new GeomBuilder()
    .box(CELL * 2 - 1, 0.2, CELL * 2 - 1, 0, 0, 0, 0x9aa09a)
    .box(10, 6.4, 4.4, 0, 0.2, -4.2, 0xe0d3b4, { windows: true })
    .box(4, 8.4, 4, -3, 0.2, 2, 0xcdd7e0, { windows: true })
    .box(4.2, 0.4, 4.2, -3, 8.6, 2, 0x6f7a85)
    .cylinder(2.4, 2.4, 2.2, 3.6, 0.2, 2.6, 0xd8c9a8, 14)
    .sphere(2.2, 3.6, 2.4, 2.6, 0x5d8a86)
    .box(10.4, 0.4, 4.8, 0, 6.6, -4.2, 0x7c6f58)
    .build(),
);
serviceModels.set('garden', () => {
  const s = CELL * 3 - 1;
  const b = new GeomBuilder().box(s, 0.18, s, 0, 0, 0, 0x62b85a).box(1.4, 0.22, s, 0, 0, 0, 0xd9cfae).box(s, 0.22, 1.4, 0, 0, 0, 0xd9cfae);
  // оранжерея и цветочные клумбы
  b.box(7, 0.3, 5, -6, 0.2, -6, 0xcfd3d6).box(6.6, 3, 4.6, -6, 0.5, -6, 0xcfe8f2).prism(7, 5, 1.6, -6, 3.5, -6, 0xbfd9e6);
  for (const [x, z, c] of [[5, -5, 0xe56b8a], [7, -3, 0xf2c14e], [5, 4, 0x8a5bb0], [7.4, 6.2, 0xe56b3a], [-5, 5, 0xe56b8a]] as [number, number, number][]) b.cylinder(1.6, 1.6, 0.4, x, 0.2, z, c, 10);
  b.cylinder(2.2, 2.4, 0.5, 0, 0.2, 0, 0xcfd3d6, 14).cylinder(1.8, 1.8, 0.52, 0, 0.2, 0, 0x4aa3d8, 14);
  for (const [x, z] of [[-9, 2], [9, 8], [-3, 9]]) tree(b, x, z);
  return b.build();
});
serviceModels.set('sports', () =>
  new GeomBuilder()
    .box(CELL * 2 - 1, 0.2, CELL * 2 - 1, 0, 0, 0, 0x8f959b)
    .box(11, 0.15, 7, 0, 0.2, 0, 0x4ea8c4)
    .box(11, 0.17, 0.2, 0, 0.22, 0, 0xffffff)
    .box(0.2, 0.17, 7, 0, 0.22, 0, 0xffffff)
    .box(12, 2.2, 1.4, 0, 0.2, -4.4, 0xcfd3d6)
    .box(12, 3.4, 0.4, 0, 0.2, 4.4, 0xdde3e8, { windows: true })
    .cylinder(0.12, 0.12, 6, -5.8, 0.2, 4.4, 0xb7bcc0, 5)
    .cylinder(0.12, 0.12, 6, 5.8, 0.2, 4.4, 0xb7bcc0, 5)
    .build(),
);

// ---------------- детали улучшений: новые службы ----------------

// ---------------- детали улучшений ----------------

const up = (key: string, f: (b: GeomBuilder) => void): void => void upgradeParts.set(key, f);

up('coal.scrubbers', (b) => b.cylinder(1.9, 1.9, 9, -9.4, 0, -9.2, 0xd7e3ee, 14).cylinder(0.4, 0.4, 5, -7.4, 4, -8, 0x4fae6a, 6, { rz: Math.PI / 2 }));
up('coal.turbines', (b) => b.box(5.4, 6.5, 4, 8, 0, -10, 0x8f969c, { windows: true }).box(5.8, 0.4, 4.4, 8, 6.5, -10, 0x5f656b));
up('coal.capture', (b) => b.box(1.6, 12, 1.6, -9.6, 0, 3, 0x7aa3c8).box(5, 1.2, 1.6, -7, 11, 3, 0x7aa3c8));
up('gas.turbine', (b) => b.cylinder(1.4, 1.4, 5, -3, 1.4, 5.6, 0xd6dade, 12, { rz: Math.PI / 2 }).box(1.2, 1.6, 1.4, 0.2, 0.2, 5.6, 0x7d8286));
up('gas.recovery', (b) => b.cylinder(1.1, 1.3, 9, 0.2, 0.2, -6, 0xcfd5da, 10).cone(1.3, 1.4, 0.2, 9.2, -6, 0x4fae6a, 10));
up('wind.tower', (b) => b.cylinder(0.25, 0.4, 11, -3.4, 0, 1, 0xf2f4f6, 8).box(1.4, 0.7, 0.7, -3.1, 11, 1, 0xe0e4e8));
up('wind.rotor', (b) => b.box(1.6, 0.5, 1.6, 0, 0, 0, 0x8d9296));
up('solar.tracker', (b) => {
  for (const x of [-4.2, 0, 4.2]) b.box(3.6, 0.15, 2.8, x, 1.0, 0, 0x2a56b8, { rx: -0.45 });
});
up('solar.cells', (b) => b.box(3, 1.6, 2, 6, 0, -6.4, 0xcfd6dc).box(3, 0.3, 2.2, 6, 1.6, -6.4, 0x4a8f5f));
up('watertower.pump', (b) => b.box(2.2, 1.6, 1.8, 2.2, 0, 1.6, 0xcfd6dc).cylinder(0.22, 0.22, 3, 1.2, 0.8, 1.2, 0x5f8fb8, 6));
up('pumpstation.pump', (b) => b.cylinder(1.2, 1.2, 2.4, 3, 0, -1.6, 0x7aa3c8, 10));
up('pumpstation.filter', (b) => b.box(2.4, 1.6, 2, -3, 0, 2, 0xd9dde0).box(2.4, 0.3, 2.2, -3, 1.6, 2, 0x4a6f93));
up('waterplant.filter', (b) => b.cylinder(2.2, 2.2, 3, 0, 0, 6, 0xb9d3e8, 14).cylinder(2.2, 2.2, 3, 5, 0, 6, 0xb9d3e8, 14));
up('waterplant.reservoir', (b) => b.cylinder(4.2, 4.4, 0.8, -4.4, 0, -4.8, 0x4f93c8, 18));
up('police.cars', (b) => b.box(1.8, 0.6, 3.4, 3.6, 0, 3.4, 0xf2f4f7).box(1.7, 0.4, 2, 3.6, 0.6, 3.2, 0x30415e).box(1.8, 0.6, 3.4, 3.6, 0, -1.2, 0xf2f4f7));
up('police.station', (b) => b.box(6.6, 1.4, 6.2, 0, 5, 0, 0x2b58b8).cylinder(0.1, 0.1, 5, -2.4, 6.4, -2, 0xcfcfcf, 5));
up('policehq.swat', (b) => b.box(4.4, 3.4, 5.4, 6.8, 0, 2, 0x39424f).box(3, 2.4, 0.3, 6.8, 0, 4.8, 0x1d232c));
up('policehq.lab', (b) => b.cylinder(2.4, 2.4, 3, -6, 0, 3, 0xdde5f2, 14).sphere(2, -6, 3, 3, 0x7aa3c8));
up('fire.ladder', (b) => b.box(0.5, 9, 0.5, -3, 0, -2.4, 0xd9d9d9).box(0.4, 0.4, 3, -3, 8.4, -1.2, 0xd9d9d9));
up('fire.tank', (b) => b.cylinder(1.3, 1.3, 3.6, 2.6, 0, -2.4, 0xb92f24, 12));
up('firehq.copter', (b) => b.cylinder(3, 3, 0.3, -2, 5.6, -2.2, 0x6e747a, 16).box(2, 0.1, 0.4, -2, 5.9, -2.2, 0xffffff).box(0.4, 0.1, 2, -2, 5.9, -2.2, 0xffffff));
up('firehq.academy', (b) => b.box(4, 3.4, 4, -7, 0, 4.8, 0xb23a2e, { windows: true }).box(4.2, 0.4, 4.2, -7, 3.4, 4.8, 0x8a8f96));
up('clinic.lab', (b) => b.box(2.4, 2.8, 2.4, 3.6, 0, -1.6, 0xeef2f5, { windows: true }));
up('clinic.ward', (b) => b.box(2.4, 3, 4.4, -3.8, 0, 0, 0xf6f8fa, { windows: true }));
up('hospital.wing', (b) => b.box(5, 6.4, 7, 7.2, 0, -2, 0xeef2f5, { windows: true }).box(5.4, 0.4, 7.4, 7.2, 6.4, -2, 0x9aa0a6));
up('hospital.icu', (b) => b.box(4.4, 4, 3, -6.6, 0, 5.8, 0xcfe6f2, { windows: true }));
up('hospital.helipad', (b) => b.cylinder(2.6, 2.6, 0.3, -3, 9.4, -2.4, 0x6e747a, 16).box(2.4, 0.1, 0.4, -3, 9.7, -2.4, 0xffffff).box(0.4, 0.1, 2.4, -3, 9.7, -2.4, 0xffffff));
up('school.labs', (b) => b.box(3.6, 3.6, 3.4, 6.6, 0, 4, 0xc4654b, { windows: true }).sphere(1.6, 6.6, 3.6, 4, 0x7aa3c8));
up('school.sports', (b) => b.box(5, 0.1, 3.4, -4, 0, 6, 0x4ea04d).box(5.2, 0.12, 0.15, -4, 0.05, 6, 0xffffff));
up('library.digital', (b) => b.cylinder(0.12, 0.12, 2.4, 3.6, 5.4, -1.4, 0xcfcfcf, 5).sphere(1, 3.6, 7.6, -1.4, 0xdde2e6));
up('university.research', (b) => b.cylinder(1.6, 1.8, 14, -9.6, 0, -6, 0xcdbf9e, 10).sphere(2.2, -9.6, 14, -6, 0x7aa3c8));
up('university.campus', (b) => b.box(5, 5, 5, 8.6, 0, -6.6, 0xcdbf9e, { windows: true }).box(5, 5, 5, -8.6, 0, -6.6, 0xcdbf9e, { windows: true }));
up('park.playground', (b) => b.box(0.2, 1.8, 0.2, -2, 0, -2.6, 0xd33a3a).box(2, 0.2, 0.2, -1, 1.6, -2.6, 0xd33a3a).box(0.2, 1.8, 0.2, 0, 0, -2.6, 0xd33a3a).box(0.8, 0.1, 0.8, -1, 0.7, -2.6, 0xe5c34d));
up('plaza.fountain', (b) => b.cylinder(2.8, 3, 0.4, 0, 0.2, 0, 0xcfd3d6, 18).cylinder(1.2, 1.4, 1.8, 0, 0.2, 0, 0xcfd3d6, 12));
up('bigpark.pavilion', (b) => b.cylinder(3, 3, 0.3, 7, 0, 7, 0xd9cfae, 8).cylinder(0.2, 0.2, 3, 5.4, 0.3, 5.6, 0xefe9da, 6).cylinder(0.2, 0.2, 3, 8.6, 0.3, 8.4, 0xefe9da, 6).cone(3.4, 1.8, 7, 3.3, 7, 0xb4533c, 8));
up('bigpark.lake', (b) => b.cylinder(3.6, 3.6, 0.3, -9, 0, -8, 0x4f93c8, 18));
up('stadium.lights', (b) => b.box(2, 1, 0.6, 0, 11, 11, 0xfff3b0).cylinder(0.2, 0.25, 11, 0, 0, 11, 0xb7bcc0, 6));
up('stadium.roof', (b) => b.cylinder(12, 12, 0.6, 0, 5.4, 0, 0x5f6a75, 24).cylinder(8, 8, 0.7, 0, 5.35, 0, 0x4ea04d, 24));
up('landfill.compaction', (b) => b.box(3, 1.6, 2, 6, 0.3, -6, 0xe8b73a).box(2.4, 0.2, 2.4, 8, 0.3, -6, 0x5f656b));
up('landfill.gas', (b) => b.cylinder(0.2, 0.25, 4, -9, 0, 6, 0x8a8f96, 6).cone(0.6, 1.2, -9, 4, 6, 0xe56b3a, 6));
up('incinerator.filters', (b) => b.box(1.8, 5, 6, -6.8, 0, -2, 0xb9bfc6).box(1.8, 0.4, 6.2, -6.8, 5, -2, 0x6e747a));
up('incinerator.boiler', (b) => b.cylinder(2.2, 2.2, 7, 5.6, 0, 3, 0x9a4a3a, 14));
up('recycling.sorting', (b) => b.box(8, 0.5, 1.4, -2, 0.2, 5.2, 0x4a4f55).box(8, 0.1, 1.2, -2, 0.7, 5.2, 0x2f9f5f));
up('recycling.hall', (b) => b.box(5, 4, 5, 6.2, 0.2, -4, 0xd7e2d6, { windows: true }).box(5.4, 0.4, 5.4, 6.2, 4.2, -4, 0x2f7d4f));
up('cemetery.expansion', (b) => {
  for (let i = -2; i <= 2; i++) b.box(0.9, 1.2, 0.3, i * 3.2, 0.1, -10.4, 0xb7bcc0);
  b.box(3.4, 3, 3, 9, 0, 9, 0xd9d1c0, { windows: true });
});
up('crematorium.furnace', (b) => b.cylinder(0.7, 0.9, 8, -2.4, 4, -1.6, 0x77706a, 8));
up('crematorium.filter', (b) => b.box(2, 3, 2, -3.6, 0, -2.4, 0xb9bfc6));
up('monument.garden', (b) => b.cylinder(7.6, 7.8, 0.2, 0, 0.2, 0, 0x62b85a, 24).cylinder(2.8, 2.8, 0.25, 0, 0.2, 7.2, 0xe56b8a, 8));
up('busdepot.garage', (b) => b.box(10, 4, 4, 0, 0.2, 4.6, 0xd7dde3).box(10.4, 0.5, 4.4, 0, 4.2, 4.6, 0x2d7a4f));
up('busdepot.hybrid', (b) => {
  for (const x of [-5, -2.4, 0.2]) b.box(0.6, 1.8, 0.6, x, 0.2, -7, 0x4a4f55).box(0.8, 0.3, 0.8, x, 2, -7, 0x35e06a);
});

up('nuclear.cooling', (b) => b.cylinder(2.4, 3.4, 6, 9, 0.2, 7, 0xd8dadc, 18));
up('nuclear.containment', (b) => b.box(6, 4, 3, -8, 0.2, -9, 0xb9bfc6, { windows: true }).box(6.2, 0.4, 3.2, -8, 4.2, -9, 0x5f656b));
up('geothermal.deep', (b) => b.cylinder(1, 1.2, 8, -6, 0.2, 5.4, 0xb9bfc6, 10).sphere(1.1, -6, 8.2, 5.4, 0xe56b3a));
up('windfarm.rotors', (b) => b.cylinder(0.25, 0.45, 12, 0, 0.2, -10, 0xf2f4f6, 8).box(1.4, 0.8, 0.8, 0.3, 12, -10, 0xe0e4e8));
up('desalination.membranes', (b) => b.box(8, 3, 3, 0, 0.2, 10.4, 0xdbe3e8, { windows: true }));
up('medcenter.diagnostics', (b) => b.box(3, 3.4, 3.4, -7, 0, -1, 0xe8eef2, { windows: true }));
up('highschool.labs', (b) => b.box(4, 3.4, 3.4, -6, 0.2, -8.6, 0xc4654b, { windows: true }).sphere(1.4, -6, 3.6, -8.6, 0x7aa3c8));
up('college.research', (b) => b.cylinder(1.4, 1.6, 10, 7, 0.2, -6, 0xcdd7e0, 10).sphere(1.8, 7, 10.2, -6, 0x7aa3c8));
up('garden.greenhouse', (b) => b.box(6, 3, 4, 7, 0.5, -10, 0xcfe8f2).prism(6.4, 4.4, 1.4, 7, 3.5, -10, 0xbfd9e6));
up('sports.stands', (b) => b.box(12, 1.6, 2, 0, 0.2, 5.6, 0xcfd3d6).box(12, 0.3, 2.2, 0, 1.8, 5.6, 0x4a6f93));

up('taxidepot.fleet', (b) => b.box(4, 3.4, 3, 5.2, 0.2, -4.4, 0xf0f2f5).box(4.4, 0.4, 3.4, 5.2, 3.6, -4.4, 0xf2c230));

// ---------------- городские символы ----------------

serviceModels.set('tvtower', () => {
  const b = slab(new GeomBuilder(), 2, 0xb9bec3);
  // решётчатая мачта сужается кверху; вверху смотровая площадка и антенна
  b.cylinder(2.2, 3.2, 10, 0, 0.2, 0, 0xc9cdd2, 8).cylinder(1.4, 2.2, 10, 0, 10.2, 0, 0xc9cdd2, 8).cylinder(0.7, 1.4, 12, 0, 20.2, 0, 0xc9cdd2, 8);
  b.cylinder(3.2, 2.6, 2.2, 0, 22, 0, 0x8f969c, 12).cylinder(3.4, 3.4, 0.4, 0, 24.2, 0, 0x4a6f93, 12).cylinder(0.25, 0.4, 14, 0, 24.6, 0, 0xd33a3a, 6);
  b.box(3, 3, 3, 0, 0.2, 5.5, 0x8f969c, { windows: true });
  return b.build();
});
serviceModels.set('clocktower', () => {
  const b = slab(new GeomBuilder(), 1, 0xcfc7b0);
  b.box(3.4, 14, 3.4, 0, 0.2, 0, 0xb5513a, { windows: true }).box(4, 0.8, 4, 0, 14.2, 0, 0xe3ddce);
  for (const [x, z, ry] of [[0, 1.75, 0], [0, -1.75, 0], [1.75, 0, Math.PI / 2], [-1.75, 0, Math.PI / 2]] as [number, number, number][]) b.cylinder(1.3, 1.3, 0.2, x, 11, z, 0xf6f6f2, 16, { rx: Math.PI / 2, ry });
  b.prism(4, 4, 3.4, 0, 15, 0, 0x4a6f93).sphere(0.4, 0, 18.2, 0, 0xffd966);
  return b.build();
});
serviceModels.set('ferriswheel', () => {
  const b = slab(new GeomBuilder(), 3, 0x8f959b);
  // опоры; само колесо вращается в анимации
  b.box(0.7, 12, 0.7, -2.2, 0.2, -3, 0xd33a3a, {}).box(0.7, 12, 0.7, 2.2, 0.2, -3, 0xd33a3a).box(0.7, 12, 0.7, -2.2, 0.2, 3, 0xd33a3a).box(0.7, 12, 0.7, 2.2, 0.2, 3, 0xd33a3a);
  b.box(8, 3, 4, 0, 0.2, 8.5, 0xf0e6d2, { windows: true }).box(8.4, 0.5, 4.4, 0, 3.2, 8.5, 0x4a6f93);
  return b.build();
});
serviceModels.set('obelisk', () => {
  const b = slab(new GeomBuilder(), 1, 0xcfc7b0);
  b.box(4, 0.8, 4, 0, 0.2, 0, 0xd9d3c3).box(3, 0.8, 3, 0, 1, 0, 0xe3ddce).cylinder(0.9, 1.5, 15, 0, 1.8, 0, 0xece7d9, 4, { ry: Math.PI / 4 }).cone(0.9, 2.2, 0, 16.8, 0, 0xd6b24a, 4);
  return b.build();
});
serviceModels.set('cathedral', () => {
  const b = slab(new GeomBuilder(), 3, 0xcfc7b0);
  b.box(9, 8, 15, 0, 0.2, 0, 0xe0d8c6, { windows: true }).prism(9.4, 15.4, 3.6, 0, 8.2, 0, 0x6f7f8a, false);
  b.box(3.4, 14, 3.4, -2.8, 0.2, 8.8, 0xd5ccb7).box(3.4, 14, 3.4, 2.8, 0.2, 8.8, 0xd5ccb7).cone(2.4, 6, -2.8, 14.2, 8.8, 0x4a6f93, 4).cone(2.4, 6, 2.8, 14.2, 8.8, 0x4a6f93, 4);
  b.box(2, 3.2, 0.3, 0, 0.2, 7.7, 0x5b3f2a).cylinder(2.2, 2.2, 0.3, 0, 7.4, 7.8, 0x9ec8e8, 14, { rx: Math.PI / 2 });
  return b.build();
});
serviceModels.set('arch', () => {
  const b = slab(new GeomBuilder(), 2, 0xcfc7b0);
  b.box(2.6, 11, 4.6, -4, 0.2, 0, 0xe3ddce).box(2.6, 11, 4.6, 4, 0.2, 0, 0xe3ddce).box(11, 3.2, 4.8, 0, 8, 0, 0xece7d9).box(11.4, 0.7, 5.2, 0, 11.2, 0, 0xd6b24a);
  b.box(0.8, 3, 0.3, -4, 4, 2.4, 0xcfc7b0).box(0.8, 3, 0.3, 4, 4, 2.4, 0xcfc7b0);
  return b.build();
});
serviceModels.set('opera', () => {
  const b = slab(new GeomBuilder(), 3, 0xcfc7b0);
  b.box(14, 4, 12, 0, 0.2, 0, 0xf0e6d2, { windows: true }).box(14.4, 0.6, 12.4, 0, 4.2, 0, 0xd6b24a);
  b.sphere(5, 0, 4.4, -1, 0xe9e2cf).cone(1.4, 4, 0, 9.4, -1, 0xd6b24a, 8);
  for (let i = -3; i <= 3; i++) b.cylinder(0.35, 0.35, 4, i * 1.9, 0.2, 6.3, 0xfaf7ee, 6);
  b.box(14, 0.5, 2.4, 0, 4.2, 6.5, 0xd6b24a);
  return b.build();
});

// ---------------- туризм ----------------

serviceModels.set('hotel', () => {
  const b = new GeomBuilder().box(CELL * 2 - 1, 0.2, CELL * 2 - 1, 0, 0, 0, 0x8d9296);
  // башня отеля с балконами, лобби со стеклянным фасадом и навесом, вывеска на крыше
  b.box(9, 18, 6, 0, 0.2, -2.5, 0xf2e6d6, { windows: true }).box(9.4, 0.6, 6.4, 0, 18.2, -2.5, 0xb88a5a);
  for (let f = 1; f < 6; f++) b.box(9.2, 0.18, 0.7, 0, 0.2 + f * 3, 0.85, 0xe9dcc8, { detail: true });
  b.box(12, 4, 4.6, 0, 0.2, 4.2, 0xdfe6ec, { windows: true }).box(6, 0.3, 2.4, 0, 3.6, 7.6, 0xb84a3a);
  for (const x of [-2.6, 2.6]) b.cylinder(0.12, 0.12, 3.4, x, 0.2, 8.5, 0xd9d2c0, 6);
  b.box(6, 1.6, 0.3, 0, 18.8, -0.9, 0xd8b04a).box(5.4, 1.1, 0.32, 0, 19.05, -0.9, 0xb84a3a);
  b.detailed(() => {
    for (const x of [-5.5, 5.5]) b.box(1, 0.5, 1, x, 0.2, 7.2, 0x9a8c74).sphere(0.55, x, 0.6, 7.2, 0x4a9a4e, {}, 7, 5);
    b.box(10, 0.06, 1.4, 0, 0.2, 8.8, 0xb84a3a);
  });
  return b.build();
});

serviceModels.set('touristinfo', () => {
  const b = new GeomBuilder().box(CELL - 1, 0.18, CELL - 1, 0, 0, 0, 0xcdbf9c);
  // павильон с большой буквой «i», карта-стенд и флаги
  b.box(4.4, 3, 3.4, 0, 0.18, -0.8, 0xeef2f5, { windows: true }).prism(5, 4, 1.4, 0, 3.18, -0.8, 0x2f7de1);
  b.box(1.2, 1.2, 0.2, 0, 1.4, 1.0, 0x2f7de1).box(0.2, 0.7, 0.22, 0, 1.55, 1.02, 0xffffff).box(0.2, 0.15, 0.22, 0, 2.35, 1.02, 0xffffff);
  b.box(1.8, 1.3, 0.12, 2.2, 0.9, 2.3, 0x4a90d9).box(0.12, 0.9, 0.12, 2.2, 0.18, 2.3, 0x3a3f46);
  for (const [x, c] of [[-2.4, 0xd8433a], [-1.6, 0x2e9e5b]] as [number, number][]) b.cylinder(0.05, 0.06, 3.6, x, 0.18, 2.6, 0xd9dde2, 6).box(0.9, 0.55, 0.04, x + 0.47, 3.1, 2.6, c);
  return b.build();
});

up('hotel.pool', (b) => b.box(5.6, 0.25, 3, -2.2, 0.2, 8.4, 0xdfe6ec).box(4.8, 0.3, 2.2, -2.2, 0.2, 8.4, 0x4aa3d8).box(0.8, 1.2, 0.8, 1.6, 0.2, 8.4, 0xf2c230));
up('hotel.wing', (b) => b.box(4, 11, 5, 6.6, 0.2, -2.5, 0xf2e6d6, { windows: true }).box(4.3, 0.5, 5.3, 6.6, 11.2, -2.5, 0xb88a5a));
up('hotel.spa', (b) => b.box(3.6, 2.6, 3.2, -6.4, 0.2, -2.5, 0xe0d4c0, { windows: true }).sphere(1.5, -6.4, 2.2, -2.5, 0x9fd4c4));
up('touristinfo.tours', (b) => b.box(3, 1.2, 1.4, -1.6, 0.4, 2.8, 0xf2c230).box(2.6, 0.5, 1.3, -1.6, 1.6, 2.8, 0x2a3b57));
up('monument.lights', (b) => {
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) b.cylinder(0.12, 0.15, 3, x, 0.2, z, 0x3a3f46, 6).box(0.5, 0.4, 0.5, x, 3.2, z, 0xfff3b0);
});
up('ferriswheel.lights', (b) => {
  // гирлянды по опорам и над павильоном
  for (const [x, z] of [[-2.2, -3], [2.2, -3], [-2.2, 3], [2.2, 3]]) for (let k = 0; k < 5; k++) b.sphere(0.2, x + (x < 0 ? -0.4 : 0.4), 1.5 + k * 2.2, z, [0xffd23a, 0xff5f8f, 0x5fd0ff][k % 3], {}, 6, 4);
  for (let i = 0; i < 9; i++) b.sphere(0.18, -4 + i, 3.9, 10.75, [0xffd23a, 0xff5f8f, 0x5fd0ff][i % 3], {}, 6, 4);
});
up('opera.festival', (b) => {
  for (const [x, c] of [[-6, 0xd8433a], [-3, 0xf2c230], [3, 0x2e9e5b], [6, 0x2f7de1]] as [number, number][]) b.cylinder(0.06, 0.08, 6, x, 0.2, 9.5, 0xd9dde2, 6).box(1.2, 2.2, 0.05, x + 0.62, 3.6, 9.5, c);
});
