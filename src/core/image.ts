/**
 * core/image.ts — the fundamental type of oko.
 * Project rule: NOTHING here touches the DOM. Core is pure and testable in Node.
 * 8-bit RGBA buffer: raw data, row by row, 4 bytes per pixel.
 */

export interface ImageBuf {
  readonly width: number;
  readonly height: number;
  /** RGBA, row-major, 4 bytes per pixel. length === width*height*4 */
  readonly data: Uint8ClampedArray;
}

export function alloc(width: number, height: number): ImageBuf {
  assertSize(width, height);
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function fromData(width: number, height: number, data: Uint8ClampedArray): ImageBuf {
  assertSize(width, height);
  if (data.length !== width * height * 4) {
    throw new RangeError(`data.length ${data.length} != ${width}*${height}*4`);
  }
  return { width, height, data };
}

export function clone(img: ImageBuf): ImageBuf {
  return fromData(img.width, img.height, new Uint8ClampedArray(img.data));
}

export function fill(img: ImageBuf, r: number, g: number, b: number, a = 255): void {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
  }
}

/**
 * Trims 100% transparent rows/columns from the border (rotate and perspective
 * use it: the content must touch the canvas, never "float" in a transparent margin).
 */
export function trimTransparent(img: ImageBuf): ImageBuf {
  const { width: w, height: h, data } = img;
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((data[(y * w + x) * 4 + 3] ?? 0) > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return img; // all transparent: we never let the image disappear
  if (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1) return img; // already tight
  const nw = x1 - x0 + 1;
  const nh = y1 - y0 + 1;
  const out = alloc(nw, nh);
  const rowBytes = nw * 4;
  for (let r = 0; r < nh; r++) {
    const srcStart = ((y0 + r) * w + x0) * 4;
    out.data.set(data.subarray(srcStart, srcStart + rowBytes), r * rowBytes);
  }
  return out;
}

export function getPixel(img: ImageBuf, x: number, y: number): [number, number, number, number] {
  checkBounds(img, x, y);
  const i = (y * img.width + x) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!];
}

export function setPixel(img: ImageBuf, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  checkBounds(img, x, y);
  const i = (y * img.width + x) * 4;
  img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
}

function assertSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`invalid size: ${width}x${height}`);
  }
}

function checkBounds(img: ImageBuf, x: number, y: number): void {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= img.width || y >= img.height) {
    throw new RangeError(`pixel out of bounds: (${x},${y}) in ${img.width}x${img.height}`);
  }
}
