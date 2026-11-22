/**
 * core/rotate.ts — rotação livre no eixo Z (sentido horário com y pra baixo).
 * Múltiplos exatos de 90°: remapeamento de pixel a pixel, SEM interpolação.
 * Ângulos arbitrários: inverse mapping (cada pixel de destino procura a origem)
 * + bilinear — que é a exceção autorizada em D5 para warp geométrico.
 * Fora dos limites da origem → transparente (0,0,0,0).
 */
import { alloc, type ImageBuf } from "./image";

export function rotateZ(img: ImageBuf, degrees: number): ImageBuf {
  if (!Number.isFinite(degrees)) throw new RangeError(`ângulo inválido: ${degrees}`);
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
      // mapa inverso: destino -> origem
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

  // bounding box dos cantos com EXTENSÃO total dos pixels de borda
  // (retângulo [-0.5 .. w-0.5] × [-0.5 .. h-0.5], não só centros) —
  // caso contrário cada rotação serra meio pixel da borda e a imagem encolhe.
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
      // centro do pixel de destino -> mundo rotacionado -> origem (rotação inversa)
      const wx = minX + ox + 0.5;
      const wy = minY + oy + 0.5;
      const sx = wx * cos + wy * sin + cx;
      const sy = -wx * sin + wy * cos + cy;
      const d = (oy * nw + ox) * 4;
      // transparente só fora da EXTENSÃO [-0.5, n-0.5]; amostra com extensão de borda
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

/**
 * Corta linhas/colunas 100% transparentes da borda. Sem isso, rotações cuja soma
 * volta a 0° deixam o conteúdo "flutuando" num canvas que cresceu passo a passo.
 */
function trimTransparent(img: ImageBuf): ImageBuf {
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
  if (x1 < 0) return img; // tudo transparente: nunca fazemos a imagem sumir
  if (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1) return img; // já justo
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
