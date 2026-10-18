import type { BufferGeometry } from 'three';
import { GeomBuilder } from './GeomBuilder';

/** Модели деревьев, кустов, цветов и камней (по id из data/props.ts). */
export function propModel(kind: string): BufferGeometry {
  const b = new GeomBuilder();
  switch (kind) {
    case 'oak':
      b.cylinder(0.3, 0.42, 2.2, 0, 0, 0, 0x6e4a2c, 6).sphere(1.9, 0, 1.6, 0, 0x3f8f45).sphere(1.35, 1.0, 2.5, 0.4, 0x4aa04f).sphere(1.2, -0.9, 2.2, -0.5, 0x37803d);
      break;
    case 'pine':
      b.cylinder(0.18, 0.28, 1.6, 0, 0, 0, 0x5a3d25, 5).cone(1.5, 2.6, 0, 1.0, 0, 0x2a6e3a, 7).cone(1.15, 2.2, 0, 2.5, 0, 0x2f7d3b, 7).cone(0.8, 1.8, 0, 3.8, 0, 0x378a45, 7);
      break;
    case 'birch':
      b.cylinder(0.16, 0.22, 3.2, 0, 0, 0, 0xe8e6de, 6).sphere(1.25, 0, 3.0, 0, 0x8fc85a).sphere(0.9, 0.7, 4.0, 0.3, 0x9fd468).sphere(0.8, -0.7, 2.4, -0.4, 0x7fb84c);
      break;
    case 'palm':
      b.cylinder(0.16, 0.26, 2.4, 0, 0, 0, 0x9a7650, 6).cylinder(0.14, 0.18, 2.2, 0.35, 2.3, 0, 0x9a7650, 6, { rz: -0.15 });
      for (let i = 0; i < 6; i++) b.box(2.4, 0.12, 0.5, 0.7 + Math.cos((i / 6) * Math.PI * 2) * 1.1, 4.4, Math.sin((i / 6) * Math.PI * 2) * 1.1, 0x3fa04a, { ry: -(i / 6) * Math.PI * 2, rz: -0.35 });
      b.sphere(0.25, 0.7, 4.3, 0.2, 0x7a5a2a);
      break;
    case 'bush':
      b.sphere(0.9, 0, 0, 0, 0x4a9a4e).sphere(0.7, 0.8, 0, 0.3, 0x3f8b45).sphere(0.6, -0.7, 0, -0.3, 0x55a85a);
      break;
    case 'flowers':
      b.sphere(0.5, 0, 0, 0, 0x4e9a4e);
      for (const [x, z, c] of [[0.2, 0.1, 0xe8465a], [-0.3, 0.2, 0xf2c230], [0.1, -0.35, 0xb056d8], [-0.2, -0.2, 0xffffff], [0.4, -0.2, 0xff8fb0]] as [number, number, number][]) b.sphere(0.2, x, 0.5, z, c);
      break;
    case 'rock':
      b.box(1.2, 0.8, 1.0, 0, 0, 0, 0x8d9096, { ry: 0.5, rz: 0.15 }).box(0.8, 0.6, 0.7, 0.6, 0, 0.4, 0x9a9da3, { ry: 1.2, rx: 0.2 });
      break;
    case 'boulder':
      b.box(2.6, 1.8, 2.2, 0, 0, 0, 0x7d8085, { ry: 0.4, rz: 0.12 }).box(1.8, 1.5, 1.6, 0.9, 0.4, 0.5, 0x8d9096, { ry: 1.1, rx: 0.25 }).box(1.2, 1, 1.1, -1, 0, -0.6, 0x6f7378, { ry: 2 });
      break;
    default:
      b.box(1, 1, 1, 0, 0, 0, 0xff00ff);
  }
  return b.build();
}
