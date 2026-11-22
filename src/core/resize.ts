/**
 * core/resize.ts — D5: Lanczos3 como ÚNICO algoritmo de resize do oko.
 * Conv separável (horizontal depois vertical) com suporte escalado no downscale:
 * ao reduzir por fator f<1 o kernel alarga por 1/f (equivalente a area-averaging
 * com kernel lanczos) — sem isso haveria aliasing. Intermediário em float32 (D4).
 *
 * lanczos(x) = sinc(x) * sinc(x/3), cortado em |x| >= 3.
 */
import { type ImageBuf } from "./image";

const A = 3;

function kernel1(x: number): number {
  if (x === 0) return 1;
  if (Math.abs(x) >= A) return 0;
  const px = Math.PI * x;
  return (Math.sin(px) / px) * (Math.sin(px / A) / (px / A));
}

export function lanczosResize(img: ImageBuf, width: number, height: number): ImageBuf {
  const intOk = [width, height].every(Number.isInteger);
  if (!intOk || width <= 0 || height <= 0) throw new RangeError(`destino inválido: ${width}x${height}`);
  if (img.width === width && img.height === height) {
    return { width, height, data: new Uint8ClampedArray(img.data) };
  }
  // eixo horizontal primeiro: axis=width, linhas permanecem img.height
  const horiz = resampleAxis(img.data, img.width, img.height, width, true);
  // eixo vertical: axis=altura original, linhas agora são a NOVA largura (stride)
  const vert = resampleAxis(horiz, img.height, width, height, false);
  return { width, height, data: new Uint8ClampedArray(vert) };
}

/**
 * Uma passada da conv separável.
 * srcCount = comprimento do eixo que estamos reamostrando.
 * lines    = quantidade de linhas perpendiculares (stride em pixels).
 */
function resampleAxis(
  src: Float32Array | Uint8ClampedArray,
  srcCount: number,
  lines: number,
  dstCount: number,
  horizontal: boolean,
): Float32Array {
  const scale = dstCount / srcCount;
  const filterScale = scale < 1 ? 1 / scale : 1;
  const radius = A * filterScale;
  const out = new Float32Array(lines * dstCount * 4);

  // pesos por pixel de destino (idênticos para todas as linhas)
  const weights: Float32Array[] = new Array(dstCount);
  const starts: number[] = new Array(dstCount);
  for (let d = 0; d < dstCount; d++) {
    const center = (d + 0.5) / scale - 0.5;
    let start = Math.ceil(center - radius - 0.5);
    let end = Math.floor(center + radius + 0.5);
    if (start < 0) start = 0;
    if (end > srcCount - 1) end = srcCount - 1;
    const n = end - start + 1;
    const ws = new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      ws[i] = kernel1((start + i - center) / filterScale);
      sum += ws[i]!;
    }
    if (sum !== 0) for (let i = 0; i < n; i++) ws[i]! /= sum; // DC gain = 1
    weights[d] = ws;
    starts[d] = start;
  }

  for (let line = 0; line < lines; line++) {
    for (let d = 0; d < dstCount; d++) {
      const ws = weights[d]!;
      const start = starts[d]!;
      let accR = 0, accG = 0, accB = 0, accA = 0;
      for (let i = 0; i < ws.length; i++) {
        const wgt = ws[i]!;
        if (wgt === 0) continue;
        const along = start + i;
        const s = (horizontal ? line * srcCount + along : along * lines + line) * 4;
        accR += src[s]! * wgt;
        accG += src[s + 1]! * wgt;
        accB += src[s + 2]! * wgt;
        accA += src[s + 3]! * wgt;
      }
      const dIdx = (horizontal ? line * dstCount + d : d * lines + line) * 4;
      out[dIdx] = accR;
      out[dIdx + 1] = accG;
      out[dIdx + 2] = accB;
      out[dIdx + 3] = accA;
    }
  }
  return out;
}
