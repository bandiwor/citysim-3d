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
    .box(11.4, 1, 8.4, 0, 6, -2, 0x2b58b8)
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
