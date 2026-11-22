/**
 * core/image.ts — tipo fundamental do oko.
 * Regra do projeto: NADA aqui toca DOM. Core é puro e testável em Node.
 * Buffer RGBA 8-bit (D4): dados crus, linha a linha, 4 bytes por pixel.
 */

export interface ImageBuf {
  readonly width: number;
  readonly height: number;
  /** RGBA, row-major, 4 bytes por pixel. length === width*height*4 */
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
    throw new RangeError(`tamanho inválido: ${width}x${height}`);
  }
}

function checkBounds(img: ImageBuf, x: number, y: number): void {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= img.width || y >= img.height) {
    throw new RangeError(`pixel fora dos limites: (${x},${y}) em ${img.width}x${img.height}`);
  }
}
