import type { MapsInput, MapsOutput } from './protocol';

/**
 * Карты влияния по клеткам сетки: покрытие служб (максимум), загрязнение/шум (сумма, ограничена 1)
 * и стоимость земли как взвешенная сумма слоёв. Чистая функция — выполняется в воркере.
 */
export function computeMaps(input: MapsInput): MapsOutput {
  const { size, cell } = input;
  const n = size * size;
  const layers: Record<string, Float32Array> = {};
  const additive = new Set<string>();
  const layer = (name: string): Float32Array => (layers[name] ??= new Float32Array(n));
  for (const name of input.layers) layer(name);

  for (const s of input.sources) {
    const arr = layer(s.layer);
    if (s.additive) additive.add(s.layer);
    const rc = s.r / cell;
    const cx = s.x / cell;
    const cz = s.z / cell;
    const x0 = Math.max(0, Math.floor(cx - rc));
    const x1 = Math.min(size - 1, Math.ceil(cx + rc));
    const z0 = Math.max(0, Math.floor(cz - rc));
    const z1 = Math.min(size - 1, Math.ceil(cz + rc));
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz) / rc;
        if (d >= 1) continue;
        const v = s.strength * (1 - d * d);
        const i = z * size + x;
        if (s.additive) arr[i] += v;
        else if (v > arr[i]) arr[i] = v;
      }
    }
  }
  for (const name of additive) {
    const a = layers[name];
    for (let i = 0; i < n; i++) if (a[i] > 1) a[i] = 1;
  }

  const landValue = new Float32Array(n);
  const entries = Object.entries(input.landValue.weights);
  for (let i = 0; i < n; i++) {
    let v = input.landValue.base + (input.shore[i] ?? 0);
    for (const [name, w] of entries) v += w * (layers[name]?.[i] ?? 0);
    landValue[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return { layers, landValue };
}

/** Бонус клеток у воды (статический слой): shoreBonus, если вода ближе radius клеток. */
export function computeShore(terrain: Uint8Array, size: number, radius: number, bonus: number, waterClass: number): Float32Array {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let near = false;
      for (let dy = -radius; dy <= radius && !near; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < size && yy < size && terrain[yy * size + xx] === waterClass) {
            near = true;
            break;
          }
        }
      }
      out[y * size + x] = near ? bonus : 0;
    }
  }
  return out;
}
