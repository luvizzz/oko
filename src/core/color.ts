/**
 * core/color.ts — D6/M4: ajuste de cor por ganho multiplicativo independente
 * por canal (0 = preto no canal, 1 = intacto, 2 = dobro). Matemática em float
 * (D4); clamp+round acontecem na volta pro Uint8ClampedArray. Alfa intocado.
 */
import { type ImageBuf } from "./image";

export function colorGain(img: ImageBuf, r: number, g: number, b: number): ImageBuf {
  for (const [n, v] of [["r", r], ["g", g], ["b", b]] as const) {
    if (!Number.isFinite(v) || v < 0) throw new RangeError(`ganho ${n} inválido: ${v}`);
  }
  const out: ImageBuf = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data.length) };
  const src = img.data;
  const dst = out.data;
  for (let i = 0; i < src.length; i += 4) {
    dst[i] = src[i]! * r;
    dst[i + 1] = src[i + 1]! * g;
    dst[i + 2] = src[i + 2]! * b;
    dst[i + 3] = src[i + 3]!;
  }
  return out;
}
