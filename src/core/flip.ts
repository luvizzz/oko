/**
 * core/flip.ts — mirror. axis "x": swaps left↔right (vertical mirror).
 * axis "y": swaps top↔bottom.
 */
import { alloc, type ImageBuf } from "./image";

export function flip(img: ImageBuf, axis: "x" | "y"): ImageBuf {
  const { width: w, height: h, data: src } = img;
  const out = alloc(w, h);
  const dst = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = axis === "x" ? w - 1 - x : x;
      const sy = axis === "y" ? h - 1 - y : y;
      const d = (y * w + x) * 4;
      const s = (sy * w + sx) * 4;
      dst[d] = src[s]!;
      dst[d + 1] = src[s + 1]!;
      dst[d + 2] = src[s + 2]!;
      dst[d + 3] = src[s + 3]!;
    }
  }
  return out;
}
