/**
 * core/perspective.ts — D6: rotação "3D" via homografia 3×3.
 * O usuário escolhe onde os 4 cantos da imagem vão cair (um trapézio/quadro
 * qualquer); calculamos a transformação projetiva que leva o retângulo-origem
 * a esse quadrilátero e preenchemos o canvas novo com INVERSE MAPPING
 * (cada pixel de destino volta à origem e amostra com bilinear — a exceção
 * autorizada em D5) + extensão de borda (D da rotação: [-0.5, n-0.5]).
 *
 * Convenção: coordenadas em "unidades de pixel" de extensão (0..w),
 * canto tl,tr,bl,br. Canvas de saída = bounding box justo do quadrilátero.
 */
import { alloc, trimTransparent, type ImageBuf } from "./image";

export interface Quad {
  tl: readonly [number, number];
  tr: readonly [number, number];
  bl: readonly [number, number];
  br: readonly [number, number];
}

/** resolve A(8×8)·h = b por eliminação de Gauss; retorna h com h9=1 fixo */
function solveHomography(src: readonly (readonly [number, number])[], dst: readonly (readonly [number, number])[]): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]!;
    const [X, Y] = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    b.push(Y);
  }
  // eliminação gaussiana com pivoteamento parcial
  for (let col = 0; col < 8; col++) {
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r]![col]!) > Math.abs(A[piv]![col]!)) piv = r;
    if (Math.abs(A[piv]![col]!) < 1e-9) return null; // sistema degenerado
    [A[col], A[piv]] = [A[piv]!, A[col]!];
    [b[col], b[piv]] = [b[piv]!, b[col]!];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r]![col]! / A[col]![col]!;
      for (let c = col; c < 8; c++) A[r]![c]! -= f * A[col]![c]!;
      b[r]! -= f * b[col]!;
    }
  }
  const h = b.map((v, i) => v / A[i]![i]!);
  h.push(1);
  return h;
}

function invert3x3(m: readonly number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const id = 1 / det;
  return [
    (e * i - f * h) * id, (c * h - b * i) * id, (b * f - c * e) * id,
    (f * g - d * i) * id, (a * i - c * g) * id, (c * d - a * f) * id,
    (d * h - e * g) * id, (b * g - a * h) * id, (a * e - b * d) * id,
  ];
}

export function perspective(img: ImageBuf, quad: Quad): ImageBuf {
  const { width: w, height: h, data: src } = img;
  const q = [quad.tl, quad.tr, quad.bl, quad.br];
  const srcCorners: (readonly [number, number])[] = [[0, 0], [w, 0], [0, h], [w, h]];

  const minX = Math.min(...q.map((c) => c[0]));
  const minY = Math.min(...q.map((c) => c[1]));
  // H leva o retângulo ao quadrilátero em coords RELATIVAS AO BBOX —
  // o inverse mapping amostra X=ox+0.5, Y=oy+0.5 (também relativas).
  const qRel: (readonly [number, number])[] = q.map((c) => [c[0] - minX, c[1] - minY] as const);
  const maxX = Math.max(...qRel.map((c) => c[0]));
  const maxY = Math.max(...qRel.map((c) => c[1]));
  const nw = Math.max(1, Math.round(maxX));
  const nh = Math.max(1, Math.round(maxY));
  if (nw * nh < 1) throw new RangeError("quadrilátero degenerado");

  // H: origem (retângulo) -> destino (quadrilátero); usamos H⁻¹ p/ inverse mapping
  const H = solveHomography(srcCorners, qRel);
  if (!H) throw new RangeError("quadrilátero inválido (degenerado ou auto-intercetante)");
  const Hi = invert3x3(H);
  if (!Hi) throw new RangeError("quadrilátero inválido (determinante nulo)");
  const [i0, i1, i2, i3, i4, i5, i6, i7, i8] = Hi as [number, number, number, number, number, number, number, number, number];

  const out = alloc(nw, nh);
  const dst = out.data;

  for (let oy = 0; oy < nh; oy++) {
    for (let ox = 0; ox < nw; ox++) {
      const X = ox + 0.5; // coord destino relativa ao próprio bbox
      const Y = oy + 0.5;
      // (X,Y,1) -> H⁻¹ -> origem em unidades de extensão
      const denom = i6 * X + i7 * Y + i8;
      const d = (oy * nw + ox) * 4;
      if (Math.abs(denom) < 1e-12) continue; // fora do plano (caso patológico)
      const sxExt = (i0 * X + i1 * Y + i2) / denom;
      const syExt = (i3 * X + i4 * Y + i5) / denom;
      // extensão: origem válida em [0,w]×[0,h]; amostra em centro de pixel
      if (sxExt < 0 || syExt < 0 || sxExt > w || syExt > h) continue; // transparente
      const sx = Math.min(Math.max(sxExt - 0.5, 0), w - 1);
      const sy = Math.min(Math.max(syExt - 0.5, 0), h - 1);
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, w - 1);
      const y1 = Math.min(y0 + 1, h - 1);
      const fx = sx - x0;
      const fy = sy - y0;
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
