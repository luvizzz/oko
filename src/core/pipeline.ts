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

export type Op =
  | { type: "resize"; width: number; height: number } // M2 ✅
  | { type: "crop"; x: number; y: number; width: number; height: number } // M2 ✅
  | { type: "rotateZ"; degrees: number } // M2 ✅
  | { type: "flip"; axis: "x" | "y" } // M2 ✅
  | { type: "perspective"; corners: readonly [number, number, number, number] } // M3
  | { type: "colorGain"; r: number; g: number; b: number } // M4
  | { type: "border"; shape: "square" | "oval" | "circle"; radius: number } // M4
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
      case "colorGain":
      case "border":
        throw new Error(`operação '${op.type}' ainda não implementada`);
      default: {
        const t: never = op; // exaustividade: TS quebra quando novo Op entra sem case
        throw new Error(`operação desconhecida: ${JSON.stringify(t)}`);
      }
    }
  }
  return out;
}
