/**
 * core/filter.ts — M6: desfoque e nitidez por convolução, sem libs.
 *
 * Desfoque: gaussiano SEPARÁVEL (2 passagens 1D de k pesos em vez de k² do
 * kernel 2D — mesma matemática, ~k/2 vezes menos multiplicações). Trabalha em
 * float (D4), amostragem com edge extension (clamp), igual rotação/perspectiva.
 *
 * Nitidez: unsharp masking clássico — realça a diferença entre a imagem e uma
 * versão desfocada dela: out = src + amount · (src − blur(src)).
 */
import { type ImageBuf } from "./image";

export function gaussianKernel(sigma: number): { radius: number; w: Float32Array } {
  if (!Number.isFinite(sigma) || sigma <= 0) throw new RangeError(`sigma inválido: ${sigma}`);
  const radius = Math.max(1, Math.ceil(3 * sigma)); // ±3σ cobre 99.7% da energia
  const w = new Float32Array(2 * radius + 1);
  const inv2s2 = 1 / (2 * sigma * sigma);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-i * i * inv2s2);
    w[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < w.length; i++) w[i]! /= sum; // normaliza: brilho preservado
  return { radius, w };
}

/** Uma passada 1D (horizontal ou vertical), edge extension por clamp. */
function convolve1D(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  kernel: Float32Array,
  radius: number,
  horizontal: boolean,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = Math.max(0, Math.min(width - 1, horizontal ? x + k : x));
        const sy = Math.max(0, Math.min(height - 1, horizontal ? y : y + k));
        const wk = kernel[k + radius]!;
        const p = (sy * width + sx) * 4;
        r += src[p]! * wk;
        g += src[p + 1]! * wk;
        b += src[p + 2]! * wk;
        a += src[p + 3]! * wk;
      }
      const i = (y * width + x) * 4;
      dst[i] = r;
      dst[i + 1] = g;
      dst[i + 2] = b;
      dst[i + 3] = a;
    }
  }
}

export function gaussianBlur(img: ImageBuf, sigma: number): ImageBuf {
  const { radius, w } = gaussianKernel(sigma);
  const n = img.width * img.height * 4;
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = img.data[i]!;
  const g = new Float32Array(n);
  convolve1D(f, g, img.width, img.height, w, radius, true); // horizontal
  convolve1D(g, f, img.width, img.height, w, radius, false); // vertical
  const out: ImageBuf = { width: img.width, height: img.height, data: new Uint8ClampedArray(n) };
  for (let i = 0; i < n; i++) out.data[i] = f[i]!; // clamp+round na volta ao 8-bit (D4)
  return out;
}

/** unsharp masking: amount 0 = original; ~1 = padrão; 2 = agressivo */
export function sharpen(img: ImageBuf, amount: number, sigma = 1): ImageBuf {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError(`amount inválido: ${amount}`);
  const blurred = gaussianBlur(img, sigma);
  const out: ImageBuf = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data.length) };
  for (let i = 0; i < img.data.length; i++) {
    out.data[i] = img.data[i]! + amount * (img.data[i]! - blurred.data[i]!);
  }
  return out;
}
