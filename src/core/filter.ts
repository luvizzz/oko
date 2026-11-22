/**
 * core/filter.ts — blur and sharpening by convolution, no libs.
 *
 * Blur: SEPARABLE gaussian (2 1D passes of k weights instead of the k² of the
 * 2D kernel — same math, ~k/2 fewer multiplications). Works in float,
 * sampling with edge extension (clamp), same as rotation/perspective.
 *
 * Sharpening: classic unsharp masking — enhances the difference between the
 * image and a blurred version of it: out = src + amount · (src − blur(src)).
 */
import { type ImageBuf } from "./image";

export function gaussianKernel(sigma: number): { radius: number; w: Float32Array } {
  if (!Number.isFinite(sigma) || sigma <= 0) throw new RangeError(`invalid sigma: ${sigma}`);
  const radius = Math.max(1, Math.ceil(3 * sigma)); // ±3σ covers 99.7% of the energy
  const w = new Float32Array(2 * radius + 1);
  const inv2s2 = 1 / (2 * sigma * sigma);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-i * i * inv2s2);
    w[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < w.length; i++) w[i]! /= sum; // normalize: brightness preserved
  return { radius, w };
}

/** One 1D pass (horizontal or vertical), edge extension by clamp. */
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

/**
 * Reusable scratch: gaussianBlur was called every slider frame and allocated
 * 2 Float32Array (8 bytes/pixel) per call — GC dominated the cost (the
 * measurement barely changed with sigma). Module buffers grow to what's needed
 * and never shrink; convolve1D only reads/writes the first width*height*4 slots.
 */
let scratchA: Float32Array | null = null;
let scratchB: Float32Array | null = null;
function scratchPair(n: number): [Float32Array, Float32Array] {
  if (!scratchA || !scratchB || scratchA.length < n) {
    scratchA = new Float32Array(n);
    scratchB = new Float32Array(n);
  }
  return [scratchA, scratchB];
}

export function gaussianBlur(img: ImageBuf, sigma: number): ImageBuf {
  const { radius, w } = gaussianKernel(sigma);
  const n = img.width * img.height * 4;
  const [f, g] = scratchPair(n);
  for (let i = 0; i < n; i++) f[i] = img.data[i]!;
  convolve1D(f, g, img.width, img.height, w, radius, true); // horizontal
  convolve1D(g, f, img.width, img.height, w, radius, false); // vertical
  const out: ImageBuf = { width: img.width, height: img.height, data: new Uint8ClampedArray(n) };
  for (let i = 0; i < n; i++) out.data[i] = f[i]!; // clamp+round on the way back to 8-bit
  return out;
}

/** unsharp masking: amount 0 = original; ~1 = default; 2 = aggressive */
export function sharpen(img: ImageBuf, amount: number, sigma = 1): ImageBuf {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError(`invalid amount: ${amount}`);
  const blurred = gaussianBlur(img, sigma);
  const out: ImageBuf = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data.length) };
  for (let i = 0; i < img.data.length; i++) {
    out.data[i] = img.data[i]! + amount * (img.data[i]! - blurred.data[i]!);
  }
  return out;
}
