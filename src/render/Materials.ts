import { CanvasTexture, Color, MeshLambertMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import { Rng } from '../core/Rng';

function makeTexture(draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  draw(c.getContext('2d')!);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Материал зданий: текстура окон (дневная) + светящиеся окна ночью (emissiveMap). */
export class BuildingMaterials {
  readonly material: MeshLambertMaterial;

  constructor() {
    const rng = new Rng(77);
    const lit: boolean[] = Array.from({ length: 4 }, () => rng.next() < 0.55);
    const map = makeTexture((g) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 4; i++) {
        const x = (i % 2) * 32 + 7;
        const y = Math.floor(i / 2) * 32 + 8;
        g.fillStyle = '#6f8ea8';
        g.fillRect(x, y, 18, 16);
        g.fillStyle = '#9db8cc';
        g.fillRect(x, y, 18, 4);
      }
    });
    const glow = makeTexture((g) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 4; i++) {
        if (!lit[i]) continue;
        g.fillStyle = '#ffcf80';
        g.fillRect((i % 2) * 32 + 7, Math.floor(i / 2) * 32 + 8, 18, 16);
      }
    });
    this.material = new MeshLambertMaterial({
      vertexColors: true,
      map,
      emissive: new Color(1, 1, 1),
      emissiveMap: glow,
      emissiveIntensity: 0,
    });
  }

  setNight(k: number): void {
    this.material.emissiveIntensity = k;
  }
}
