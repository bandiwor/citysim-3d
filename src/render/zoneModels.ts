import type { BufferGeometry } from 'three';
import { Rng } from '../core/Rng';
import { GeomBuilder } from './GeomBuilder';

const FLOOR = 3;
const W = 0xffffff;

type Maker = (b: GeomBuilder, r: Rng) => void;

const ROOF_RED = 0xb4533c;
const ROOF_GREY = 0x8d949b;

/** Этажность по уровню зоны и номеру варианта. */
const floorsIn = (r: Rng, lo: number, hi: number): number => lo + Math.round(r.next() * (hi - lo));

// ================= ЖИЛЫЕ =================

const RES: Maker[][] = [
  // Уровень 1: частные дома
  [
    // коттедж с вальмовой крышей
    (b, r) => {
      const w = 4.8 + r.range(0, 1);
      b.box(w, FLOOR, 4.4, 0, 0, 0, W, { windows: true }).roof(w + 0.8, 5.2, 2.2, 0, FLOOR, 0, ROOF_RED).box(0.7, 1.6, 0.7, -w / 4, FLOOR + 1.2, 0, 0x8a4a38).box(2.2, 0.3, 1.2, 0, 0, 2.6, 0xd9cfb8);
    },
    // двухэтажный дом с двускатной крышей
    (b) => {
      b.box(5.2, FLOOR * 2, 4.4, 0, 0, 0, W, { windows: true }).prism(5.8, 5, 2.6, 0, FLOOR * 2, 0, 0x8e4a3a).box(2.4, 0.3, 1.3, 0, 0, 2.7, 0xd9cfb8).box(0.6, 1.4, 0.6, 1.4, FLOOR * 2 + 1.6, 0, 0x7a4030);
    },
    // таунхаус из трёх секций
    (b) => {
      b.box(2.2, FLOOR * 2, 5, -2.2, 0, 0, 0xf4d9c6, { windows: true }).box(2.2, FLOOR * 2.3, 5, 0, 0, 0, 0xd9e4f4, { windows: true }).box(2.2, FLOOR * 2, 5, 2.2, 0, 0, 0xf4eac6, { windows: true });
      for (const x of [-2.2, 0, 2.2]) b.box(2.3, 0.35, 5.2, x, FLOOR * 2 + (x === 0 ? FLOOR * 0.3 : 0), 0, 0x6f737a).box(0.8, 1.9, 0.2, x, 0, 2.55, 0x5a3f2c);
    },
    // бунгало Г-образной формы
    (b) => {
      b.box(4.8, FLOOR, 3.4, -0.4, 0, -0.8, W, { windows: true }).box(2.8, FLOOR, 3.6, 1.8, 0, 1.4, W, { windows: true }).roof(5.6, 4.2, 2, -0.4, FLOOR, -0.8, ROOF_RED).roof(3.6, 4.4, 2, 1.8, FLOOR, 1.4, 0x9a4a35);
    },
    // вилла с гаражом и забором
    (b) => {
      b.box(4.6, FLOOR * 2, 4.4, -0.6, 0, -0.4, W, { windows: true }).roof(5.4, 5.2, 2.4, -0.6, FLOOR * 2, -0.4, 0x7a5a48).box(2.4, 2.8, 3.6, 2.4, 0, 0.6, 0xe9e2d3).prism(2.8, 4, 1, 2.4, 2.8, 0.6, 0x6f737a, false);
      b.box(7, 0.8, 0.12, 0, 0, 3.4, 0xcfc6b0).box(7, 0.8, 0.12, 0, 0, -3.4, 0xcfc6b0);
    },
    // хижина с крутой крышей
    (b) => {
      b.box(4, FLOOR, 4, 0, 0, 0, 0xd8b890, { windows: true }).roof(5, 5, 3.4, 0, FLOOR, 0, 0x6e4a3a).box(0.8, 4.2, 0.8, 1.3, 0, 0.6, 0x8a8f96).box(3.6, 0.25, 1.4, 0, 0, 2.7, 0xb08a60);
    },
  ],
  // Уровень 2: жилые дома
  [
    // типовая «коробка»
    (b, r) => {
      const f = floorsIn(r, 3, 5);
      b.box(6.2, f * FLOOR, 5.8, 0, 0, 0, W, { windows: true }).box(6.6, 0.4, 6.2, 0, f * FLOOR, 0, ROOF_GREY).box(1.8, 1.4, 1.8, -1.6, f * FLOOR + 0.4, 1, 0xc9ccd0);
    },
    // П-образный дом с двором
    (b, r) => {
      const f = floorsIn(r, 4, 5);
      b.box(2.2, f * FLOOR, 6.6, -2.4, 0, 0, W, { windows: true }).box(2.2, f * FLOOR, 6.6, 2.4, 0, 0, W, { windows: true }).box(7, f * FLOOR, 2.2, 0, 0, -2.2, 0xf1ece4, { windows: true });
      b.box(7.2, 0.4, 2.4, 0, f * FLOOR, -2.2, ROOF_GREY).box(2.4, 0.4, 6.8, -2.4, f * FLOOR, 0, ROOF_GREY).box(2.4, 0.4, 6.8, 2.4, f * FLOOR, 0, ROOF_GREY).box(2.4, 0.15, 3.8, 0, 0, 1.6, 0x6fae62);
    },
    // ступенчатая терраса
    (b) => {
      b.box(6.4, FLOOR * 4, 3.2, 0, 0, -1.8, W, { windows: true }).box(6.4, FLOOR * 3, 2.4, 0, 0, 0.6, 0xf2ede4, { windows: true }).box(6.4, FLOOR * 2, 2, 0, 0, 2.5, W, { windows: true });
      b.box(6.6, 0.35, 3.4, 0, FLOOR * 4, -1.8, ROOF_GREY).box(6.6, 0.35, 2.6, 0, FLOOR * 3, 0.6, ROOF_GREY).box(6.6, 0.35, 2.2, 0, FLOOR * 2, 2.5, ROOF_GREY);
    },
    // длинная плита с балконами
    (b) => {
      const f = 5;
      b.box(7, f * FLOOR, 3.6, 0, 0, 0, W, { windows: true }).box(7.2, 0.4, 3.8, 0, f * FLOOR, 0, ROOF_GREY);
      for (let i = 1; i < f; i++) b.box(6.6, 0.18, 0.7, 0, i * FLOOR, 2.1, 0xd7d2c4);
    },
    // угловая башня с террасой
    (b, r) => {
      const f = floorsIn(r, 5, 7);
      b.box(4.2, f * FLOOR, 4.2, -0.8, 0, -0.8, W, { windows: true }).box(6.6, FLOOR * 2, 6.6, 0, 0, 0, 0xece6da, { windows: true }).box(4.6, 0.4, 4.6, -0.8, f * FLOOR, -0.8, ROOF_GREY).box(4.6, 0.7, 0.12, -0.8, f * FLOOR + 0.4, 1.4, 0xb8bcc0);
    },
    // кирпичный дом с лестничной башней
    (b, r) => {
      const f = floorsIn(r, 3, 5);
      b.box(6.2, f * FLOOR, 5.4, -0.2, 0, 0, 0xd6a98b, { windows: true }).box(1.7, (f + 1) * FLOOR, 1.7, 2.8, 0, 2.2, 0xc99578, { windows: true }).prism(2.1, 2.1, 1.2, 2.8, (f + 1) * FLOOR, 2.2, 0x6f4a3a).prism(6.6, 5.8, 1.1, -0.2, f * FLOOR, 0, 0x7a5d4b);
    },
  ],
  // Уровень 3: высотки
  [
    // башня на подиуме
    (b, r) => {
      const f = floorsIn(r, 8, 14);
      b.box(7.2, FLOOR * 2, 7.2, 0, 0, 0, 0xe9e9e4, { windows: true }).box(5.2, f * FLOOR, 5.2, 0, FLOOR * 2, 0, W, { windows: true }).box(5.6, 0.5, 5.6, 0, FLOOR * (f + 2), 0, ROOF_GREY).box(2.2, 1.6, 2.2, 0.8, FLOOR * (f + 2) + 0.5, -0.5, 0xb9bec3).cylinder(0.12, 0.12, 4, -1.4, FLOOR * (f + 2) + 0.5, 1.2, 0xcc4444, 5);
    },
    // две башни-близнецы
    (b, r) => {
      const f = floorsIn(r, 9, 13);
      b.box(7, FLOOR * 2, 6.6, 0, 0, 0, 0xe4e2dc, { windows: true }).box(2.8, f * FLOOR, 2.8, -1.9, FLOOR * 2, 0, W, { windows: true }).box(2.8, (f - 2) * FLOOR, 2.8, 1.9, FLOOR * 2, 0, W, { windows: true });
      b.box(3, 0.4, 3, -1.9, (f + 2) * FLOOR, 0, ROOF_GREY).box(3, 0.4, 3, 1.9, f * FLOOR, 0, ROOF_GREY).cylinder(0.1, 0.1, 3, -1.9, (f + 2) * FLOOR + 0.4, 0, 0xd0d0d0, 5);
    },
    // тонкая плита-небоскрёб
    (b, r) => {
      const f = floorsIn(r, 11, 15);
      b.box(6.6, FLOOR, 4.4, 0, 0, 0, 0xe4e2dc, { windows: true }).box(6.4, f * FLOOR, 2.8, 0, FLOOR, 0, W, { windows: true }).box(6.6, 1.2, 3, 0, FLOOR * (f + 1), 0, 0xb9bec3).cylinder(0.1, 0.2, 5, 2, FLOOR * (f + 1) + 1.2, 0, 0xd0d0d0, 5);
    },
    // ступенчатая башня
    (b, r) => {
      const f = floorsIn(r, 4, 5);
      b.box(6.6, f * FLOOR, 6.6, 0, 0, 0, W, { windows: true }).box(5, f * FLOOR, 5, 0, f * FLOOR, 0, 0xf1ede6, { windows: true }).box(3.4, f * FLOOR, 3.4, 0, 2 * f * FLOOR, 0, W, { windows: true }).box(3.8, 0.5, 3.8, 0, 3 * f * FLOOR, 0, ROOF_GREY).cylinder(0.1, 0.2, 4, 0, 3 * f * FLOOR + 0.5, 0, 0xcc4444, 5);
    },
    // восьмигранная башня с куполом
    (b, r) => {
      const f = floorsIn(r, 9, 12);
      b.box(4.4, f * FLOOR, 4.4, 0, 0, 0, W, { windows: true }).box(4.4, f * FLOOR, 4.4, 0, 0, 0, 0xf2eee8, { windows: true, ry: Math.PI / 4 }).sphere(2.2, 0, f * FLOOR - 0.4, 0, 0x7d9cb0).cylinder(0.1, 0.1, 3, 0, f * FLOOR + 3.8, 0, 0xd0d0d0, 5);
    },
    // крестообразная башня
    (b, r) => {
      const f = floorsIn(r, 8, 12);
      b.box(6.4, f * FLOOR, 2.8, 0, 0, 0, W, { windows: true }).box(2.8, f * FLOOR, 6.4, 0, 0, 0, 0xf1ede6, { windows: true }).box(3.4, 0.6, 3.4, 0, f * FLOOR, 0, ROOF_GREY).cylinder(0.12, 0.2, 5, 0, f * FLOOR + 0.6, 0, 0xcc4444, 5);
    },
  ],
];

// ================= КОММЕРЧЕСКИЕ =================

const COM: Maker[][] = [
  [
    // магазин с козырьком
    (b, r) => {
      const f = floorsIn(r, 1, 2);
      b.box(6.8, f * FLOOR + 0.6, 5.6, 0, 0, -0.4, W, { windows: true }).box(6.8, 0.3, 1.8, 0, 2.4, 2.9, 0xd9523b).box(2.4, 1.2, 0.2, 1.6, f * FLOOR + 0.8, 2.4, 0x2d78c8).box(1.4, 0.8, 1.4, -2, f * FLOOR + 0.6, -1, 0xb7babd);
    },
    // кафе с террасой и зонтами
    (b) => {
      b.box(4.4, FLOOR, 3.6, -1, 0, -1.4, 0xf3e3c8, { windows: true }).box(4.8, 0.3, 2, -1, 2.4, 0.8, 0x2f8f6f).box(7, 0.15, 2.4, 0, 0, 2, 0xb08a60);
      for (const x of [-2.2, 0, 2.2]) b.cylinder(0.06, 0.06, 1.8, x, 0.15, 2.2, 0xdddddd, 5).cone(1.1, 0.5, x, 1.9, 2.2, [0xd9523b, 0xf2c14e, 0x4a90d9][Math.round((x + 2.2) / 2.2)], 8);
    },
    // аптека на углу
    (b) => {
      b.box(6, FLOOR * 1.3, 5.2, 0, 0, 0, 0xe9f1ea, { windows: true }).box(6.2, 0.3, 5.4, 0, FLOOR * 1.3, 0, ROOF_GREY).box(2.2, 0.7, 0.2, 0, 3.4, 2.7, 0x2f9f5f).box(0.8, 2.4, 0.2, 0, 2.6, 2.75, 0x2f9f5f).box(2.2, 0.3, 0.2, 0, 3.7, 2.8, 0xffffff);
    },
    // супермаркет с парковкой
    (b) => {
      b.box(6.8, 3.6, 4.2, 0, 0, -1.4, W, { windows: true }).box(6.9, 0.4, 4.3, 0, 3.6, -1.4, 0x6f7a85).box(3.6, 1, 0.3, 0, 3.8, 0.8, 0xe04b3d).box(7, 0.08, 2, 0, 0, 2.6, 0x4a4d52);
      for (const x of [-2.6, -0.9, 0.9, 2.6]) b.box(0.1, 0.02, 1.6, x, 0.08, 2.6, 0xe8e8e0);
    },
    // булочная с двускатной крышей
    (b) => {
      b.box(4.6, 2.8, 4.2, 0, 0, 0, 0xf6e4c8, { windows: true }).prism(5.2, 4.8, 2, 0, 2.8, 0, 0xa84f3a).box(0.7, 1.6, 0.7, 1.4, 3.6, 0, 0x8a4a38).box(2.6, 0.25, 1.1, 0, 2.2, 2.4, 0xe7a23b);
    },
    // торговый ряд
    (b) => {
      const cols = [0xd9523b, 0x2f8f6f, 0x4a90d9];
      for (let i = 0; i < 3; i++) b.box(2.3, FLOOR, 5, -2.4 + i * 2.4, 0, 0, i === 1 ? 0xeef2f6 : W, { windows: true }).box(2.3, 0.28, 1.3, -2.4 + i * 2.4, 2.3, 3, cols[i]);
      b.box(7.4, 0.3, 5.2, 0, FLOOR, 0, 0x6f7a85);
    },
  ],
  [
    // офис
    (b, r) => {
      const f = floorsIn(r, 3, 5);
      b.box(7, FLOOR, 7, 0, 0, 0, 0xcfe3f2, { windows: true }).box(6.2, f * FLOOR, 6.2, 0, FLOOR, 0, W, { windows: true }).box(6.6, 0.5, 6.6, 0, FLOOR * (f + 1), 0, 0x6e7a85).box(2.2, 1.2, 2.2, 1.4, FLOOR * (f + 1) + 0.5, 1, 0xaab3ba);
    },
    // торговый центр
    (b) => {
      b.box(7, 4.6, 6.4, 0, 0, 0, 0xeff1f4, { windows: true }).box(7.1, 0.4, 6.5, 0, 4.6, 0, 0x6f7a85).box(4.6, 1.4, 0.3, 0, 5, 3.3, 0xe04b3d).box(3.2, 3, 0.2, 0, 0, 3.3, 0x9cc4e4).box(2, 1.2, 2, -2.2, 5, -1.5, 0xb7babd);
    },
    // отель
    (b, r) => {
      const f = floorsIn(r, 5, 7);
      b.box(4.8, f * FLOOR, 4.8, 0, 0, -0.6, W, { windows: true }).box(6.4, 0.3, 2.6, 0, 3, 2.8, 0x8a5a9a).cylinder(0.12, 0.12, 3, -2.8, 0, 3.8, 0x8f959b, 5).cylinder(0.12, 0.12, 3, 2.8, 0, 3.8, 0x8f959b, 5).box(2.8, 0.9, 0.2, 0, f * FLOOR + 0.2, 1.8, 0xd9a21e);
    },
    // банк с колоннами
    (b) => {
      b.box(6, 4.6, 5, 0, 0, -0.8, 0xe9e4d8, { windows: true }).prism(6.4, 5.2, 1.4, 0, 4.6, -0.8, 0x8d949b).box(6.4, 0.3, 1.6, 0, 3.6, 2.3, 0xcfc8b8);
      for (const x of [-2.4, -0.8, 0.8, 2.4]) b.cylinder(0.3, 0.3, 3.6, x, 0, 2.5, 0xf2eee6, 8);
    },
    // Г-образный офис
    (b, r) => {
      const f = floorsIn(r, 3, 5);
      b.box(7, f * FLOOR, 3.2, 0, 0, -1.8, W, { windows: true }).box(3, f * FLOOR - FLOOR, 4.4, -2, 0, 1.6, 0xe4eef6, { windows: true }).box(7.2, 0.4, 3.4, 0, f * FLOOR, -1.8, 0x6e7a85);
    },
    // универмаг уступами
    (b) => {
      b.box(7, FLOOR * 1.6, 6.6, 0, 0, 0, 0xf3e8dc, { windows: true }).box(5.2, FLOOR * 1.6, 5, 0, FLOOR * 1.6, 0, W, { windows: true }).box(7.2, 0.3, 6.8, 0, FLOOR * 1.6, 0, 0xc7544a).box(3.4, 1, 0.2, 0, FLOOR * 3.2 + 0.3, 2.6, 0xe04b3d);
    },
  ],
  [
    // стеклянная башня
    (b, r) => {
      const f = floorsIn(r, 9, 14);
      b.box(7.4, FLOOR * 2, 7.4, 0, 0, 0, 0xcfe3f2, { windows: true }).box(5.8, f * FLOOR, 5.8, 0, FLOOR * 2, 0, 0xe4f1fb, { windows: true }).box(4.2, 2 * FLOOR, 4.2, 0, FLOOR * (f + 2), 0, 0xe4f1fb, { windows: true }).cylinder(0.1, 0.25, 7, 0, FLOOR * (f + 4), 0, 0xd9d9d9, 5);
    },
    // башня со шпилем
    (b, r) => {
      const f = floorsIn(r, 10, 14);
      b.box(6.4, f * FLOOR, 6.4, 0, 0, 0, 0xdce9f4, { windows: true }).box(4.8, FLOOR * 2, 4.8, 0, f * FLOOR, 0, 0xe4f1fb, { windows: true }).cone(1.6, 3, 0, FLOOR * (f + 2), 0, 0x9fb7c8, 4).cylinder(0.08, 0.1, 5, 0, FLOOR * (f + 2) + 2.5, 0, 0xd9d9d9, 5);
    },
    // сдвоенный стеклянный
    (b, r) => {
      const f = floorsIn(r, 9, 13);
      b.box(3.2, f * FLOOR, 6.2, -2, 0, 0, 0xe4f1fb, { windows: true }).box(3.2, (f - 2) * FLOOR, 6.2, 2, 0, 0, 0xcfe3f2, { windows: true }).box(1.2, FLOOR * 2, 6, 0, 0, 0, 0x9cc4e4, { windows: true });
    },
    // плита
    (b, r) => {
      const f = floorsIn(r, 10, 13);
      b.box(7, f * FLOOR, 3.4, 0, 0, 0, 0xe4f1fb, { windows: true }).box(7.2, 0.8, 3.6, 0, f * FLOOR, 0, 0x8f9aa5).box(1.4, 1.6, 1.4, 2.4, f * FLOOR + 0.8, 0, 0xb9c3cc);
    },
    // шестигранная корона
    (b, r) => {
      const f = floorsIn(r, 9, 12);
      b.box(4.8, f * FLOOR, 4.8, 0, 0, 0, 0xe4f1fb, { windows: true }).box(4.8, f * FLOOR, 4.8, 0, 0, 0, 0xdce9f4, { windows: true, ry: Math.PI / 4 }).sphere(2.1, 0, f * FLOOR - 0.5, 0, 0x8fb7d4);
    },
    // башня с круглой верхушкой
    (b, r) => {
      const f = floorsIn(r, 9, 12);
      b.box(5.8, f * FLOOR, 5.8, 0, 0, 0, 0xe4f1fb, { windows: true }).cylinder(2.6, 2.8, 4.5, 0, f * FLOOR, 0, 0xcfe3f2, 14).cylinder(0.1, 0.2, 5, 0, f * FLOOR + 4.5, 0, 0xd9d9d9, 5);
    },
  ],
];

// ================= ПРОМЫШЛЕННЫЕ =================

const IND: Maker[][] = [
  [
    // склад
    (b) => {
      b.box(6.8, 4, 5.8, 0, 0, 0, 0xd8dde3, { windows: true }).box(7, 0.5, 6, 0, 4, 0, 0x7b8590).cylinder(0.6, 0.7, 6.5, -2.2, 4, -1.6, 0x9a5a48, 8).box(2.4, 2.4, 2.4, 2.2, 4.5, 1.4, 0xb8bec5);
    },
    // мастерская с двускатной крышей
    (b) => {
      b.box(6.4, 3.4, 5, 0, 0, 0, 0xcfd6dc, { windows: true }).prism(7, 5.6, 2.2, 0, 3.4, 0, 0x6f7a85).box(2.4, 2.6, 0.2, 0, 0, 2.55, 0x7a8590);
    },
    // сарай с трубой
    (b) => {
      b.box(5.4, 3, 4.6, -0.6, 0, 0, 0xd8cfc0, { windows: true }).prism(6, 5.2, 1.6, -0.6, 3, 0, 0x8a5a48).cylinder(0.5, 0.6, 7, 2.2, 0, -1.8, 0x9a5a48, 8);
    },
    // контейнерная площадка
    (b) => {
      const cols = [0xd9523b, 0x2f8f6f, 0x4a90d9, 0xf2c14e, 0xcfd3d6];
      let k = 0;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) for (let h = 0; h < (i + j) % 3 + 1; h++) b.box(2.2, 1.25, 2.6, -2.4 + i * 2.4, h * 1.3, -1.6 + j * 3.2, cols[k++ % cols.length]);
      b.box(2, 2.4, 1.6, 2.6, 0, 3, 0xb8bec5, { windows: true });
    },
    // небольшие резервуары
    (b) => {
      b.cylinder(1.5, 1.5, 3.4, -2.2, 0, -1.6, 0xcfd3d6, 12).cylinder(1.5, 1.5, 3.4, 0.8, 0, -1.6, 0xcfd3d6, 12).cylinder(1.2, 1.2, 2.6, -2.2, 0, 1.9, 0xb7bec5, 12).box(2.4, 2.2, 2.2, 2.2, 0, 1.6, 0xd8dde3, { windows: true }).cylinder(0.2, 0.2, 4, -0.6, 0, 0.2, 0x8a8f96, 6);
    },
    // лесопилка
    (b) => {
      b.box(4.4, 2.8, 4, 1.2, 0, -1.2, 0xc9a87c, { windows: true }).prism(5, 4.6, 1.4, 1.2, 2.8, -1.2, 0x6f4a3a);
      for (let i = 0; i < 4; i++) b.cylinder(0.45, 0.45, 3.6, -2.4, i % 2 ? 0.8 : 0, 0.8 + i * 0.7 * (i % 2 ? 0.5 : 1), 0x8a5a38, 8, { rz: Math.PI / 2 });
    },
  ],
  [
    // завод
    (b) => {
      b.box(7, 4.5, 4.4, 0, 0, -1.4, 0xd0d6dd, { windows: true }).box(4.4, 3.6, 3.2, -1.2, 0, 2.4, 0xc4cad1, { windows: true }).box(7.2, 0.5, 4.6, 0, 4.5, -1.4, 0x6f7983).cylinder(0.55, 0.65, 8, 2.4, 4.5, -2.2, 0x9a5a48, 8).cylinder(0.55, 0.65, 6.5, 0.8, 4.5, -2.2, 0x9a5a48, 8).cylinder(1.1, 1.1, 3.2, 2.8, 0, 2.6, 0xe8e0c8, 10);
    },
    // цех с зубчатой крышей
    (b) => {
      b.box(7, 3.4, 5.8, 0, 0, 0, 0xd0d6dd, { windows: true });
      for (let i = 0; i < 3; i++) b.prism(2.2, 5.8, 1.5, -2.3 + i * 2.3, 3.4, 0, 0x7b8590, false);
      b.cylinder(0.5, 0.6, 7, 2.8, 3.4, -2.4, 0x9a5a48, 8);
    },
    // резервуарный парк
    (b) => {
      for (const [x, z] of [[-2, -1.8], [1.6, -1.8], [-2, 1.8], [1.6, 1.8]]) b.cylinder(1.5, 1.5, 4.2, x, 0, z, 0xe3e6e8, 14).cone(1.55, 0.7, x, 4.2, z, 0xaab2b8, 14);
      b.box(6, 0.25, 0.4, -0.2, 2, 0, 0x8a8f96).box(0.4, 0.25, 4, -0.2, 2.4, 0, 0x8a8f96);
    },
    // длинный сборочный цех с трубой
    (b) => {
      b.box(7, 3.6, 3.6, 0, 0, -1.4, 0xcdd3da, { windows: true }).box(7.2, 0.4, 3.8, 0, 3.6, -1.4, 0x5f6973).box(3, 2.6, 2.6, -1.8, 0, 2.2, 0xb8bec5, { windows: true }).cylinder(0.6, 0.7, 9, 2.6, 0, 2, 0x9a5a48, 8);
    },
    // холодильный склад
    (b) => {
      b.box(5.4, 4.2, 5, -0.6, 0, 0, 0xe6f0f5, { windows: true }).box(5.6, 0.4, 5.2, -0.6, 4.2, 0, 0x7b8590).box(1.2, 0.9, 1.2, -1.6, 4.6, 1, 0xb7bec5).box(1.2, 0.9, 1.2, 0.2, 4.6, -1, 0xb7bec5).box(1.8, 2.4, 3, 3, 0, 0, 0xcfd6dc);
    },
    // литейный цех с огромной трубой
    (b) => {
      b.box(6, 4, 5, -0.4, 0, 0, 0xc9cfd6, { windows: true }).prism(6.4, 5.2, 1.6, -0.4, 4, 0, 0x5f6973).cylinder(0.8, 1.1, 10, 2.6, 0, -1.6, 0x8a5a48, 10).cylinder(0.85, 0.85, 0.8, 2.6, 10, -1.6, 0x2e2e2e, 10);
    },
  ],
  [
    // завод-гигант
    (b) => {
      b.box(7, 5, 5.2, 0, 0, -1.2, 0xcdd3da, { windows: true }).box(7.2, 0.5, 5.4, 0, 5, -1.2, 0x5f6973).cylinder(1.4, 1.4, 4.6, -2.4, 0, 2.6, 0xe8e0c8, 12).cylinder(1.4, 1.4, 4.6, 0.4, 0, 2.6, 0xe8e0c8, 12).cylinder(0.5, 0.6, 9, 2.4, 5, -2.6, 0x8d9aa6, 8).box(2, 1.4, 2, 2.4, 5.4, 1.4, 0xaab3ba);
    },
    // нефтеперерабатывающий завод
    (b) => {
      for (const [x, h] of [[-2.4, 9], [-0.6, 7], [1.2, 8]]) b.cylinder(0.55, 0.65, h, x, 0, -1.6, 0xd6dadd, 10);
      b.sphere(1.5, 2.2, 0, 1.8, 0xcfd3d6).sphere(1.3, -1.6, 0, 2, 0xcfd3d6).box(5.6, 0.3, 0.3, 0, 3, -1.6, 0x8a8f96).box(6, 2.4, 1.8, 0, 0, 3.4, 0xb7bec5);
    },
    // градирни и машинный зал
    (b) => {
      b.cylinder(1.8, 2.6, 7, -1.9, 0, -1.4, 0xcfd2d6, 16).cylinder(1.8, 2.6, 6, 1.9, 0, 2, 0xcfd2d6, 16).box(3.2, 3.6, 4.2, 2.3, 0, -2, 0xb8bec5, { windows: true });
    },
    // химический комбинат
    (b) => {
      b.sphere(1.7, -2, 0, -1.6, 0xe3e6e8).sphere(1.7, 1.6, 0, -1.6, 0xe3e6e8).cylinder(1.2, 1.2, 5, -2, 0, 2.2, 0xcfd3d6, 12).cylinder(0.4, 0.4, 9, 1.8, 0, 2.2, 0x9a5a48, 8).box(2, 3.2, 3, 0.4, 0, 0.6, 0xb8bec5, { windows: true }).box(5, 0.25, 0.25, 0, 3, -1.6, 0x8a8f96);
    },
    // мега-склад с кранами
    (b) => {
      b.box(6.8, 4.4, 4.6, 0, 0, -1.2, 0xd8dde3, { windows: true }).box(7, 0.5, 4.8, 0, 4.4, -1.2, 0x6f7983);
      for (const x of [-2.8, 2.8]) b.box(0.3, 6, 0.3, x, 0, 2.6, 0xe0a42e).box(0.3, 0.3, 3.4, x, 6, 1.2, 0xe0a42e);
      b.box(6, 0.3, 0.3, 0, 6, 2.6, 0xe0a42e);
    },
    // сталелитейный комбинат
    (b) => {
      b.box(7, 3.6, 3.6, 0, 0, -1.6, 0xc4cad1, { windows: true }).box(7.2, 0.4, 3.8, 0, 3.6, -1.6, 0x5f6973).cylinder(0.9, 1.1, 8, 2.6, 0, 2, 0x8a5a48, 10).cone(1.6, 2, -2.6, 0, 2.4, 0x3a3a3a, 8).cone(1.2, 1.5, -0.8, 0, 2.6, 0x8a6a4a, 8);
    },
  ],
];

const TABLE: Record<string, Maker[][]> = { res: RES, com: COM, ind: IND };

/** Геометрия здания зоны: по 6 разных построек на каждый уровень. Новые зоны без модели рисуются как простая коробка. */
export function zoneModel(zone: string, level: number, variant: number): BufferGeometry {
  const levels = TABLE[zone];
  const makers = levels?.[Math.min(level, levels.length) - 1];
  const b = new GeomBuilder();
  if (!makers) return b.box(6, 4 * level, 6, 0, 0, 0, W, { windows: true }).build();
  const v = ((variant % makers.length) + makers.length) % makers.length;
  makers[v](b, new Rng(zone.charCodeAt(0) * 1000 + level * 37 + v * 7919));
  return b.build();
}

/** Сколько вариантов внешнего вида есть у уровня зоны. */
export const zoneVariantCount = (zone: string, level: number): number => TABLE[zone]?.[level - 1]?.length ?? 1;
