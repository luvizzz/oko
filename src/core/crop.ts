/**
 * core/crop.ts — recorte retangular. Cópia; valida bounds antes de tocar em pixels.
 */
import { alloc, type ImageBuf } from "./image";

export function crop(img: ImageBuf, x: number, y: number, width: number, height: number): ImageBuf {
  const intOk = [x, y, width, height].every(Number.isInteger);
  if (!intOk) throw new RangeError("crop exige coordenadas inteiras");
  if (width <= 0 || height <= 0) throw new RangeError(`crop vazio: ${width}x${height}`);
  if (x < 0 || y < 0 || x + width > img.width || y + height > img.height) {
    throw new RangeError(`crop (${x},${y} ${width}x${height}) fora de ${img.width}x${img.height}`);
  }
  const out = alloc(width, height);
  const rowBytes = width * 4;
  for (let r = 0; r < height; r++) {
    const srcStart = ((y + r) * img.width + x) * 4;
    out.data.set(img.data.subarray(srcStart, srcStart + rowBytes), r * rowBytes);
  }
  return out;
}
