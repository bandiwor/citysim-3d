import { CELL } from '../config/constants';
import { GeomBuilder } from './GeomBuilder';
import { serviceModels } from './models';

/* Обновлённые модели старых зданий: парки, электричество, водоснабжение, службы. Подключается после serviceExtras и заменяет прежние. */


/** Лиственное дерево из нескольких крон. */
const oak = (b: GeomBuilder, x: number, z: number, s = 1, leaf = 0x3f9448): void => {
  b.cylinder(0.2 * s, 0.3 * s, 1.7 * s, x, 0, z, 0x6e4a2c, 6);
  b.sphere(1.25 * s, x, 1.3 * s, z, leaf).sphere(0.9 * s, x + 0.7 * s, 2.1 * s, z + 0.3 * s, 0x4aa04f).sphere(0.8 * s, x - 0.6 * s, 1.9 * s, z - 0.4 * s, 0x36803d);
};
const pine = (b: GeomBuilder, x: number, z: number, s = 1): void => {
  b.cylinder(0.15 * s, 0.22 * s, 1.1 * s, x, 0, z, 0x5a3d25, 5).cone(1.2 * s, 2 * s, x, 0.8 * s, z, 0x2a6e3a, 7).cone(0.9 * s, 1.7 * s, x, 1.9 * s, z, 0x30803e, 7).cone(0.6 * s, 1.4 * s, x, 2.9 * s, z, 0x389048, 7);
};
const bush = (b: GeomBuilder, x: number, z: number, s = 1, c = 0x4a9a4e): void => void b.sphere(0.55 * s, x, 0, z, c).sphere(0.42 * s, x + 0.5 * s, 0, z + 0.2 * s, 0x3f8b45);
const bench = (b: GeomBuilder, x: number, z: number, ry = 0): void => {
  b.box(1.5, 0.12, 0.5, x, 0.45, z, 0x8a6a45, { ry }).box(1.5, 0.45, 0.1, x, 0.6, z, 0x7a5a38, { ry }).box(0.12, 0.45, 0.45, x, 0, z, 0x40454b, { ry });
};
const lamp = (b: GeomBuilder, x: number, z: number): void => void b.cylinder(0.07, 0.09, 2.6, x, 0, z, 0x3a3f46, 5).sphere(0.22, x, 2.5, z, 0xfff3b0);
const flowers = (b: GeomBuilder, x: number, z: number, cols = [0xe8465a, 0xf2c230, 0xb056d8, 0xffffff]): void => {
  b.cylinder(0.7, 0.7, 0.14, x, 0.16, z, 0x3f8b45, 8);
  for (let i = 0; i < 5; i++) b.sphere(0.13, x + Math.cos(i * 1.3) * 0.4, 0.28, z + Math.sin(i * 1.3) * 0.4, cols[i % cols.length]);
};
const pond = (b: GeomBuilder, x: number, z: number, r: number): void => void b.cylinder(r + 0.3, r + 0.35, 0.2, x, 0.14, z, 0xd9cfae, 14).cylinder(r, r, 0.24, x, 0.14, z, 0x4aa3d8, 14);

serviceModels.set('park', () => {
  const b = new GeomBuilder().box(7.8, 0.16, 7.8, 0, 0, 0, 0x4e9a48).box(7.2, 0.18, 7.2, 0, 0, 0, 0x62b85a);
  // дорожки крест-накрест с бордюром и круглая площадка
  b.box(1.1, 0.22, 7.2, 0, 0, 0, 0xdcd2b2).box(7.2, 0.22, 1.1, 0, 0, 0, 0xdcd2b2).cylinder(1.4, 1.4, 0.24, 0, 0, 0, 0xcdbf9c, 14);
  pond(b, -2.3, -2.2, 1.0);
  oak(b, 2.8, 2.8, 1.05);
  oak(b, -2.8, 2.7, 0.9, 0x4a9a42);
  pine(b, 2.9, -2.8, 0.9);
  for (const [x, z] of [[-3.4, 0.9], [3.4, -0.9], [0.9, 3.4], [-0.9, -3.4]] as [number, number][]) bush(b, x, z, 0.9);
  flowers(b, 1.7, 1.7);
  flowers(b, -1.7, 1.8, [0xff8fb0, 0xffffff, 0xf2c230]);
  bench(b, 1.0, 0.1);
  bench(b, -1.0, -0.1, Math.PI);
  lamp(b, 1.2, -1.2);
  lamp(b, -1.2, 1.2);
  return b.build();
});

serviceModels.set('plaza', () => {
  const b = new GeomBuilder().box(7.6, 0.2, 7.6, 0, 0, 0, 0xcfc4a4).box(6.6, 0.22, 6.6, 0, 0, 0, 0xddd2b2);
  // узор плитки
  for (let i = -3; i <= 3; i++) b.box(0.08, 0.24, 6.4, i, 0, 0, 0xc2b690).box(6.4, 0.24, 0.08, 0, 0, i, 0xc2b690);
  b.cylinder(2.3, 2.5, 0.55, 0, 0.2, 0, 0xcfd3d6, 18).cylinder(1.95, 1.95, 0.58, 0, 0.2, 0, 0x4aa3d8, 18).cylinder(0.3, 0.4, 1.6, 0, 0.2, 0, 0xcfd3d6, 8);
  for (const [x, z] of [[-3.1, -3.1], [3.1, 3.1], [-3.1, 3.1], [3.1, -3.1]] as [number, number][]) {
    b.box(0.9, 0.5, 0.9, x, 0.2, z, 0x9a8f78);
    oak(b, x, z, 0.6, 0x4aa04f);
  }
  bench(b, 2.8, -0.5, 0);
  bench(b, -2.8, 0.5, Math.PI);
  lamp(b, 2.2, 2.2);
  lamp(b, -2.2, -2.2);
  return b.build();
});

serviceModels.set('bigpark', () => {
  const s = CELL * 2 - 0.5;
  const b = new GeomBuilder().box(s, 0.18, s, 0, 0, 0, 0x4e9a48).box(s - 0.8, 0.2, s - 0.8, 0, 0, 0, 0x62b85a);
  // кольцо и аллеи
  b.cylinder(6.6, 6.6, 0.22, 0, 0, 0, 0xdcd2b2, 32).cylinder(5.4, 5.4, 0.24, 0, 0, 0, 0x62b85a, 32);
  b.box(2, 0.24, s - 0.8, 0, 0, 0, 0xdcd2b2).box(s - 0.8, 0.24, 2, 0, 0, 0, 0xdcd2b2);
  b.cylinder(3.2, 3.5, 0.7, 0, 0, 0, 0xcfd3d6, 18).cylinder(2.7, 2.7, 0.72, 0, 0, 0, 0x4aa3d8, 18).cylinder(0.3, 0.4, 2.4, 0, 0, 0, 0xcfd3d6, 8).sphere(0.7, 0, 2.2, 0, 0x7cc6ea);
  for (const [x, z, k] of [[-5.6, -5.6, 0], [5.6, -5.4, 1], [-5.5, 5.6, 1], [5.7, 5.5, 0], [-6.4, 0.3, 1], [6.3, -0.2, 0], [-0.3, -6.4, 0], [0.3, 6.4, 1]] as [number, number, number][]) {
    if (k) pine(b, x, z, 1.1);
    else oak(b, x, z, 1.15);
  }
  for (const [x, z] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]] as [number, number][]) flowers(b, x, z);
  for (const [x, z, r] of [[0, 4.4, 0], [0, -4.4, Math.PI], [4.4, 0, Math.PI / 2], [-4.4, 0, -Math.PI / 2]] as [number, number, number][]) bench(b, x, z, r);
  for (const [x, z] of [[2.4, 2.4], [-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4]] as [number, number][]) lamp(b, x, z);
  return b.build();
});

serviceModels.set('wind', () => {
  const b = new GeomBuilder();
  b.cylinder(1.1, 1.3, 0.4, 0, 0, 0, 0x8d9296, 10).cylinder(0.28, 0.6, 15, 0, 0.3, 0, 0xf2f4f6, 10);
  // красно-белые полосы у вершины и техническая дверь
  b.cylinder(0.33, 0.36, 0.6, 0, 11.4, 0, 0xd33a3a, 10).cylinder(0.3, 0.33, 0.6, 0, 12.8, 0, 0xd33a3a, 10);
  b.box(0.7, 1.3, 0.12, 0, 0.3, 0.62, 0x4a5058).box(1.7, 1.3, 1.5, 1.7, 0, 1.3, 0xd7dde3);
  // гондола и ступица (лопасти — анимация)
  b.box(2.6, 1.1, 1.2, 0.2, 14.5, 0, 0xe3e7eb).box(0.8, 0.5, 0.5, -1.4, 14.7, 0, 0xcfd4d9).sphere(0.5, 1.3, 15, 0, 0xcfd4d9).cone(0.5, 0.9, 1.7, 14.55, 0, 0xcfd4d9, 8, { rz: -Math.PI / 2 });
  return b.build();
});

serviceModels.set('solar', () => {
  const b = new GeomBuilder().box(CELL * 2 - 1, 0.2, CELL * 2 - 1, 0, 0, 0, 0x8d9296).box(CELL * 2 - 2.2, 0.22, CELL * 2 - 2.2, 0, 0, 0, 0x9a9fa3);
  for (const x of [-4.2, 0, 4.2]) {
    for (const z of [-3.6, 3.6]) {
      // рама, стекло, ячейки и стойки
      b.box(3.7, 0.12, 2.9, x, 0.9, z, 0xb9c0c7, { rx: -0.45 }).box(3.5, 0.16, 2.7, x, 0.92, z, 0x1b3a80, { rx: -0.45 });
      for (let i = -1; i <= 1; i++) b.box(0.05, 0.2, 2.7, x + i * 1.16, 0.93, z, 0x9db4e8, { rx: -0.45 });
      b.box(3.5, 0.2, 0.05, x, 0.94, z, 0x9db4e8, { rx: -0.45 });
      b.cylinder(0.08, 0.1, 1, x - 1.4, 0, z + 0.55, 0x7a8087, 5).cylinder(0.08, 0.1, 1, x + 1.4, 0, z + 0.55, 0x7a8087, 5);
    }
  }
  b.box(1.4, 1.1, 1.2, 6.6, 0.2, 0, 0xd7dde3).box(1.5, 0.15, 1.3, 6.6, 1.3, 0, 0x5f656b);
  return b.build();
});

serviceModels.set('watertower', () => {
  const b = new GeomBuilder().cylinder(1.9, 2.1, 0.3, 0, 0, 0, 0x8d9296, 8);
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]] as [number, number][]) b.cylinder(0.16, 0.2, 6.6, x, 0, z, 0x8f959b, 5);
  // поперечные связи и лестница
  for (const y of [1.8, 4]) b.box(2.8, 0.1, 0.1, 0, y, -1.3, 0x7a8087).box(2.8, 0.1, 0.1, 0, y, 1.3, 0x7a8087).box(0.1, 0.1, 2.8, -1.3, y, 0, 0x7a8087).box(0.1, 0.1, 2.8, 1.3, y, 0, 0x7a8087);
  b.box(0.12, 7, 0.12, 1.55, 0, 0.2, 0x5f656b).box(0.12, 7, 0.12, 1.55, 0, 0.7, 0x5f656b);
  b.cylinder(2.7, 2.7, 3.4, 0, 6.5, 0, 0x8fb7d9, 16).cylinder(2.78, 2.78, 0.2, 0, 7.4, 0, 0x6c8fb0, 16).cylinder(2.78, 2.78, 0.2, 0, 9, 0, 0x6c8fb0, 16);
  b.cone(2.9, 1.8, 0, 9.9, 0, 0x6c8fb0, 16).cylinder(0.12, 0.12, 1.2, 0, 11.4, 0, 0x5f656b, 5);
  b.cylinder(0.22, 0.22, 6.5, 0, 0, 0, 0x5f8fb8, 6);
  return b.build();
});

serviceModels.set('waterplant', () => {
  const b = new GeomBuilder().box(CELL * 2 - 1, 0.18, CELL * 2 - 1, 0, 0, 0, 0x8d9296);
  // здание с пилообразной крышей
  b.box(8.4, 4.2, 5.2, -2.6, 0.18, 4.4, 0xdfe4e8, { windows: true });
  for (let i = 0; i < 3; i++) b.prism(2.8, 5.4, 1.2, -4.8 + i * 2.2, 4.4, 4.4, 0x4a6f93, false);
  // резервуары, отстойники и трубы
  b.cylinder(3.6, 3.6, 3.4, 3.8, 0.18, -4, 0x8fb7d9, 18).cylinder(3.7, 3.7, 0.25, 3.8, 3.5, -4, 0x6c8fb0, 18);
  b.cylinder(3.6, 3.6, 3.4, -3.8, 0.18, -4, 0x8fb7d9, 18).cylinder(3.7, 3.7, 0.25, -3.8, 3.5, -4, 0x6c8fb0, 18);
  b.box(3.6, 0.3, 2.6, 4.6, 0.18, 4.4, 0x5f8fb8).box(3.2, 0.34, 2.2, 4.6, 0.18, 4.4, 0x4aa3d8);
  b.cylinder(0.5, 0.5, 8, 5.6, 0.18, 4.6, 0x9aa6b0, 8).box(0.5, 0.5, 6, 0, 3.2, -0.2, 0x9aa6b0).box(0.3, 0.3, 8, -6, 1.2, -1, 0x7aa3c8);
  return b.build();
});

serviceModels.set('pumpstation', () => {
  const b = new GeomBuilder().box(5.8, 0.15, 5.4, 0, 0, 0, 0x8d9296);
  b.box(4.4, 3, 3.6, -0.4, 0.15, -0.2, 0xcfd6dc, { windows: true }).prism(4.8, 4, 1.4, -0.4, 3.15, -0.2, 0x4a6f93, true);
  // трубы с фланцами, вентиль и бак
  b.cylinder(0.32, 0.32, 3.4, 2.4, 0.5, 1.4, 0x5f8fb8, 8, { rz: Math.PI / 2 }).cylinder(0.45, 0.45, 0.2, 0.9, 0.5, 1.4, 0x7aa3c8, 8, { rz: Math.PI / 2 }).cylinder(0.45, 0.45, 0.2, 3.1, 0.5, 1.4, 0x7aa3c8, 8, { rz: Math.PI / 2 });
  b.cylinder(0.14, 0.14, 1, 1.8, 0.8, 1.4, 0x40454b, 5).cylinder(0.4, 0.4, 0.1, 1.8, 1.8, 1.4, 0xd33a3a, 8);
  b.cylinder(1, 1, 2.2, -2.3, 0.15, 2, 0x8fb7d9, 12).cylinder(0.12, 0.12, 5, -2.3, 2.4, 2, 0x7aa3c8, 6);
  b.box(1.1, 1.8, 0.12, 0, 0.15, 1.65, 0x4a5058);
  return b.build();
});

serviceModels.set('coal', () => {
  const b = new GeomBuilder().box(26, 0.2, 26, 0, 0, 0, 0x7d8286);
  b.box(14, 7, 8, -2, 0.2, 4, 0x70767c, { windows: true }).box(14.4, 0.5, 8.4, -2, 7.2, 4, 0x4f545a);
  b.box(9, 14, 9, -4, 0.2, -6, 0x5f656b, { windows: true }).box(9.4, 0.5, 9.4, -4, 14.2, -6, 0x464b50);
  // дымовые трубы в красно-белую полоску
  for (const [x, z, h] of [[6, -7, 24], [9, -3, 20]] as [number, number, number][]) {
    b.cylinder(1.2, 1.4, h, x, 0.2, z, 0xb34a3c, 12);
    for (let y = 4; y < h - 3; y += 6) b.cylinder(1.22, 1.3, 2.2, x, y, z, 0xf2f2f2, 12);
    b.cylinder(1.25, 1.25, 1.4, x, h, z, 0x2e2e2e, 12);
  }
  // градирня, ленточный конвейер и угольный террикон
  b.cylinder(3.4, 4.8, 15, 7, 0.2, 6, 0xc7cacd, 18).cylinder(3.3, 3.4, 1.2, 7, 15, 6, 0xaab0b5, 18);
  b.box(1, 0.5, 14, -9, 4, 2, 0x4a4f55, { rx: -0.0 }).box(1.4, 0.2, 14, -9, 3.7, 2, 0x2e3237);
  b.cone(3.6, 3.2, -9, 0.2, 8.4, 0x2b2b2b, 9).cone(2.6, 2.4, -6, 0.2, 10, 0x34363a, 8);
  return b.build();
});

serviceModels.set('gas', () => {
  const b = new GeomBuilder().box(CELL * 2 - 1, 0.2, CELL * 2 - 1, 0, 0, 0, 0x7d8286);
  b.box(9, 5, 5, -2, 0.2, 3, 0xc9ced3, { windows: true }).box(9.4, 0.4, 5.4, -2, 5.2, 3, 0x5f656b);
  for (const z of [4, -3.6]) {
    b.cylinder(2.2, 2.2, 6, 4.4, 0.2, z, 0xe6e9ec, 16).sphere(2.2, 4.4, 5.2, z, 0xe6e9ec);
    for (const y of [1.4, 3.2, 5]) b.cylinder(2.28, 2.28, 0.16, 4.4, y, z, 0xb9bfc6, 16);
  }
  b.cylinder(0.9, 1.1, 13, -4.8, 0.2, -4.6, 0x8a8f96, 10).cylinder(0.95, 0.95, 1.2, -4.8, 8, -4.6, 0xd33a3a, 10).box(1, 0.6, 9, 0, 1.2, -2.4, 0x6b7076).box(0.3, 0.3, 9, 2.4, 2.4, 0.2, 0x9aa0a6);
  return b.build();
});

serviceModels.set('police', () => {
  const b = new GeomBuilder().box(7, 0.16, 6.8, 0, 0, 0, 0x8d9296);
  b.box(6.4, 4, 6.2, 0, 0.16, 0, 0xdde5f2, { windows: true }).box(6.6, 1, 6.4, 0, 4.16, 0, 0x2b58b8);
  b.box(6.7, 0.18, 6.5, 0, 5.16, 0, 0x1f3f8a).box(1.8, 2.5, 0.3, 0, 0.16, 3.2, 0x2a3b57).box(2.6, 0.2, 0.9, 0, 2.8, 3.5, 0x2b58b8);
  b.box(6.4, 0.3, 0.12, 0, 3.6, 3.12, 0x2b58b8).cylinder(0.07, 0.07, 3, 2.9, 5.2, -2.4, 0xcfcfcf, 5).box(0.9, 0.55, 0.05, 3.35, 7.2, -2.4, 0x2b58b8);
  return b.build();
});

serviceModels.set('fire', () => {
  const b = new GeomBuilder().box(7, 0.16, 6.8, 0, 0, 0.3, 0x8d9296);
  b.box(6.6, 4.4, 6.2, 0, 0.16, 0.3, 0xc83b2e, { windows: true });
  for (const x of [-2.1, 0, 2.1]) b.box(1.7, 3.2, 0.3, x, 0.16, 3.5, 0xf2f2f2).box(1.5, 0.15, 0.32, x, 1.6, 3.52, 0xbfc5ca).box(1.5, 0.15, 0.32, x, 2.4, 3.52, 0xbfc5ca);
  b.box(2, 8, 2, 2.6, 0.16, -2.4, 0xa72f26).box(2.4, 0.5, 2.4, 2.6, 8, -2.4, 0x6e2a22).box(6.8, 0.4, 6.4, 0, 4.6, 0.3, 0x8a8f96).box(6.6, 0.25, 0.1, 0, 4.1, 3.4, 0xf2f2f2);
  return b.build();
});

serviceModels.set('clinic', () => {
  const b = new GeomBuilder().box(7, 0.16, 6.6, 0, 0, 0, 0x8d9296);
  b.box(6.4, 4.2, 6, 0, 0.16, 0, 0xf6f8fa, { windows: true }).box(6.6, 0.4, 6.2, 0, 4.36, 0, 0x9aa0a6);
  b.box(2.4, 0.5, 0.8, 0, 4.76, 0, 0xd83a3a).box(0.8, 0.5, 2.4, 0, 4.76, 0, 0xd83a3a).box(2.2, 2.6, 0.3, 0, 0.16, 3.1, 0x33506e).box(3, 0.2, 1, 0, 2.9, 3.4, 0xd83a3a);
  b.box(6.4, 0.2, 0.12, 0, 1.3, 3.06, 0x4aa3d8);
  return b.build();
});
