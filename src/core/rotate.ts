/**
 * core/rotate.ts — free rotation on the Z axis (clockwise with y pointing down).
 * Exact multiples of 90°: pixel-to-pixel remapping, NO interpolation.
 * Arbitrary angles: inverse mapping (each destination pixel looks up its source)
 * + bilinear — the authorized exception to the Lanczos-only rule for geometric warps.
 * Outside the source bounds → transparent (0,0,0,0).
 */
import { alloc, trimTransparent, type ImageBuf } from "./image";

export function rotateZ(img: ImageBuf, degrees: number): ImageBuf {
  if (!Number.isFinite(degrees)) throw new RangeError(`invalid angle: ${degrees}`);
  const ang = ((degrees % 360) + 360) % 360;
  if (ang === 0) return structuredCloneImage(img);
  if (ang === 90 || ang === 180 || ang === 270) return rotateExact(img, ang);
  return rotateArbitrary(img, (ang * Math.PI) / 180);
}

function structuredCloneImage(img: ImageBuf): ImageBuf {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

function rotateExact(img: ImageBuf, ang: 90 | 180 | 270): ImageBuf {
  const { width: w, height: h, data: src } = img;
  const [nw, nh] = ang === 180 ? [w, h] : [h, w];
  const out = alloc(nw, nh);
  const dst = out.data;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      // inverse map: destination -> source
      let sx: number, sy: number;
      if (ang === 90) {
        sx = y;
        sy = h - 1 - x;
      } else if (ang === 180) {
        sx = w - 1 - x;
        sy = h - 1 - y;
      } else {
        sx = w - 1 - y;
        sy = x;
      }
      const d = (y * nw + x) * 4;
      const s = (sy * w + sx) * 4;
      dst[d] = src[s]!;
      dst[d + 1] = src[s + 1]!;
      dst[d + 2] = src[s + 2]!;
      dst[d + 3] = src[s + 3]!;
    }
  }
  return out;
}

function rotateArbitrary(img: ImageBuf, theta: number): ImageBuf {
  const { width: w, height: h, data: src } = img;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;

  // bounding box of the corners with the FULL EXTENT of the border pixels
  // (rectangle [-0.5 .. w-0.5] x [-0.5 .. h-0.5], not just centers) —
  // otherwise each rotation shaves half a pixel off the border and the image shrinks.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [px, py] of [[-0.5, -0.5], [w - 0.5, -0.5], [-0.5, h - 0.5], [w - 0.5, h - 0.5]] as const) {
    const rx = (px - cx) * cos - (py - cy) * sin;
    const ry = (px - cx) * sin + (py - cy) * cos;
    minX = Math.min(minX, rx);
    maxX = Math.max(maxX, rx);
    minY = Math.min(minY, ry);
    maxY = Math.max(maxY, ry);
  }
  const nw = Math.max(1, Math.round(maxX - minX));
  const nh = Math.max(1, Math.round(maxY - minY));
  const out = alloc(nw, nh);
  const dst = out.data;

  for (let oy = 0; oy < nh; oy++) {
    for (let ox = 0; ox < nw; ox++) {
      // destination pixel center -> rotated world -> source (inverse rotation)
      const wx = minX + ox + 0.5;
      const wy = minY + oy + 0.5;
      const sx = wx * cos + wy * sin + cx;
      const sy = -wx * sin + wy * cos + cy;
      const d = (oy * nw + ox) * 4;
      // transparent only outside the EXTENT [-0.5, n-0.5]; sample with edge extension
      if (sx < -0.5 || sy < -0.5 || sx > w - 0.5 || sy > h - 0.5) continue;
      const scx = Math.min(Math.max(sx, 0), w - 1);
      const scy = Math.min(Math.max(sy, 0), h - 1);
      const x0 = Math.floor(scx);
      const y0 = Math.floor(scy);
      const x1 = Math.min(x0 + 1, w - 1);
      const y1 = Math.min(y0 + 1, h - 1);
      const fx = scx - x0;
      const fy = scy - y0;
      for (let c = 0; c < 4; c++) {
        const p00 = src[(y0 * w + x0) * 4 + c]!;
        const p10 = src[(y0 * w + x1) * 4 + c]!;
        const p01 = src[(y1 * w + x0) * 4 + c]!;
        const p11 = src[(y1 * w + x1) * 4 + c]!;
        dst[d + c] = p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy;
      }
    }
  }
  return trimTransparent(out);
}
