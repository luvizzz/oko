/**
 * core/pipeline.ts — a edição do oko é uma LISTA de operações puras (D9/M5):
 * o estado da app = imagem original + ops. Undo/redo e persistência de sessão
 * derivam disso de graça — nunca guardamos snapshots de pixels.
 * A lista de tipos cresce a cada milestone; op desconhecida = erro explícito.
 */
import type { ImageBuf } from "./image";
import { flip } from "./flip";
import { crop } from "./crop";
import { rotateZ } from "./rotate";
import { lanczosResize } from "./resize";
import { perspective, type Quad } from "./perspective";
import { colorGain } from "./color";
import { border, type BorderShape } from "./border";
import { gaussianBlur, sharpen } from "./filter";

export type Op =
  | { type: "resize"; width: number; height: number } // M2 ✅
  | { type: "crop"; x: number; y: number; width: number; height: number } // M2 ✅
  | { type: "rotateZ"; degrees: number } // M2 ✅
  | { type: "flip"; axis: "x" | "y" } // M2 ✅
  | { type: "perspective"; quad: Quad } // M3 ✅
  | { type: "colorGain"; r: number; g: number; b: number } // M4 ✅
  | { type: "border"; shape: BorderShape; radius: number } // M4 ✅
  | { type: "blur"; sigma: number } // M6 ✅
  | { type: "sharpen"; amount: number; sigma: number } // M6 ✅
  | { type: "__none__" };

export function runPipeline(img: ImageBuf, ops: readonly Op[]): ImageBuf {
  let out = img;
  for (const op of ops) {
    switch (op.type) {
      case "__none__":
        break;
      case "flip":
        out = flip(out, op.axis);
        break;
      case "crop":
        out = crop(out, op.x, op.y, op.width, op.height);
        break;
      case "rotateZ":
        out = rotateZ(out, op.degrees);
        break;
      case "resize":
        out = lanczosResize(out, op.width, op.height);
        break;
      case "perspective":
        out = perspective(out, op.quad);
        break;
      case "colorGain":
        out = colorGain(out, op.r, op.g, op.b);
        break;
      case "border":
        out = border(out, op.shape, op.radius);
        break;
      case "blur":
        out = gaussianBlur(out, op.sigma);
        break;
      case "sharpen":
        out = sharpen(out, op.amount, op.sigma);
        break;
      default: {
        const t: never = op; // exaustividade: TS quebra quando novo Op entra sem case
        throw new Error(`operação desconhecida: ${JSON.stringify(t)}`);
      }
    }
  }
  return out;
}
