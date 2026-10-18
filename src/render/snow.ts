import type { Material } from 'three';

/** Снежный покров 0..1 — общий для всех материалов (обновляет WeatherView). */
export const SNOW = { value: 0 };

/**
 * Добавляет материалу снег на обращённые вверх поверхностях (крыши, земля, кроны).
 * strength — насколько сильно белеет (дороги и стены почти не трогаем).
 */
export function withSnow(mat: Material, strength = 1): void {
  const prev = mat.onBeforeCompile;
  const k = { value: strength };
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uSnow = SNOW;
    sh.uniforms.uSnowK = k;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSnow;\nuniform float uSnowK;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  #ifndef FLAT_SHADED
  {
    float upw = dot(normalize(vNormal), normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
    float cover = uSnow * uSnowK * smoothstep(0.3, 0.75, upw);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.99), cover);
  }
  #endif`,
      );
  };
  mat.needsUpdate = true;
}
