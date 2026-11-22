/**
 * core/border.ts — border mask. Outside the shape → alpha 0; at the transition,
 * anti-aliased coverage via signed distance (0.5px ramp) multiplying the
 * existing alpha (never destroys prior transparency from perspective/rotation).
 *
 * shapes:
 *  - "square": rectangle with rounded corners by `radius` (px)
 *  - "oval":   ellipse inscribed in the image dimensions
 *  - "circle": central inscribed circle (min(w,h))
 */
import { type ImageBuf } from "./image";

export type BorderShape = "square" | "oval" | "circle";

export function border(img: ImageBuf, shape: BorderShape, radius: number): ImageBuf {
  const { width: w, height: h, data: src } = img;
  const dst = new Uint8ClampedArray(src);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const halfW = w / 2;
  const halfH = h / 2;

  let rx = 0;
  if (shape === "square") {
    if (!Number.isFinite(radius) || radius < 0) throw new RangeError(`invalid radius: ${radius}`);
    rx = Math.min(radius, Math.min(halfW, halfH)); // "rounded" corners up to the limit
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sd: number; // signed distance: <0 inside, >0 outside, in px
      if (shape === "square") {
        const dx = Math.abs(x - cx) - (halfW - rx);
        const dy = Math.abs(y - cy) - (halfH - rx);
        const ax = Math.max(dx, 0);
        const ay = Math.max(dy, 0);
        sd = Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - rx;
      } else if (shape === "oval") {
        const u = (x - cx) / halfW;
        const v = (y - cy) / halfH;
        const rNorm = Math.hypot(u / 1, v / 1);
        // distance approximation for AA: scale by the smaller semi-axis
        sd = (rNorm - 1) * Math.min(halfW, halfH);
      } else {
        const rad = Math.min(halfW, halfH) - 0.5;
        sd = Math.hypot(x - cx, y - cy) - rad;
      }
      const coverage = Math.min(Math.max(0.5 - sd, 0), 1); // 1px AA ramp
      if (coverage < 1) {
        const i = (y * w + x) * 4 + 3;
        dst[i] = src[i]! * coverage;
      }
    }
  }
  return { width: w, height: h, data: dst };
}
