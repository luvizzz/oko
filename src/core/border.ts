/**
 * core/border.ts — M4: máscara de borda. Fora da forma → alfa 0; na transição,
 * cobertura anti-aliased por signed distance (0.5px de rampa) multiplicando o
 * alfa existente (nunca destrói transparência anterior da perspectiva/rotação).
 *
 * shapes:
 *  - "square": retângulo com cantos arredondados por `radius` (px)
 *  - "oval":   elipse inscrita nas dimensões da imagem
 *  - "circle": círculo central inscrito (min(w,h))
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
    if (!Number.isFinite(radius) || radius < 0) throw new RangeError(`raio inválido: ${radius}`);
    rx = Math.min(radius, Math.min(halfW, halfH)); // cantos "arredondados" até o limite
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sd: number; // distância assinada: <0 dentro, >0 fora, em px
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
        // aproximação de distância p/ AA: escala pelo semi-eixo menor
        sd = (rNorm - 1) * Math.min(halfW, halfH);
      } else {
        const rad = Math.min(halfW, halfH) - 0.5;
        sd = Math.hypot(x - cx, y - cy) - rad;
      }
      const coverage = Math.min(Math.max(0.5 - sd, 0), 1); // rampa AA de 1px
      if (coverage < 1) {
        const i = (y * w + x) * 4 + 3;
        dst[i] = src[i]! * coverage;
      }
    }
  }
  return { width: w, height: h, data: dst };
}
