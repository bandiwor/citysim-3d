import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace, type Scene } from 'three';
import type { Game } from '../core/Game';
import type { View } from './View';


function icon(emoji: string): SpriteMaterial {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(20,24,32,0.85)';
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.font = '34px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, 32, 35);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return new SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false });
}

/** Значки над зданиями с проблемами: нет электричества/воды, пожар, нет дороги. */
export class AlertView implements View {
  private _sprites: Sprite[] = [];
  private _mats: Record<string, SpriteMaterial>;
  private _timer = 0;

  constructor(private _scene: Scene, private _game: Game) {
    this._mats = { power: icon('⚡'), water: icon('💧'), fire: icon('🔥'), road: icon('🚧') };
  }

  update(realDt: number): void {
    this._timer += realDt;
    this._bob(realDt);
    if (this._timer < 0.5) return;
    this._timer = 0;
    let k = 0;
    for (const b of this._game.world.list()) {
      if (k >= this._game.config.render.alertLimit) break;
      let kind: string | null = null;
      if (b.fire > 0) kind = 'fire';
      else if (!b.abandoned) {
        if (!b.access && (b.kind === 'zone' || b.powerNeed > 0)) kind = 'road';
        else if (!b.powered) kind = 'power';
        else if (!b.watered) kind = 'water';
      }
      if (!kind) continue;
      let s = this._sprites[k];
      if (!s) {
        s = new Sprite(this._mats[kind]);
        s.renderOrder = 10;
        this._sprites.push(s);
        this._scene.add(s);
      }
      s.material = this._mats[kind];
      s.visible = true;
      s.scale.setScalar(0.04);
      s.userData.baseY = 14 + b.level * 3;
      s.position.set(b.x, s.userData.baseY, b.z);
      k++;
    }
    for (let i = k; i < this._sprites.length; i++) this._sprites[i].visible = false;
  }

  private _bob(_dt: number): void {
    const t = performance.now() / 400;
    for (const s of this._sprites) if (s.visible) s.position.y = (s.userData.baseY as number) + Math.sin(t + s.position.x) * 0.6;
  }
}
