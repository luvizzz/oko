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

export function applyOp(img: ImageBuf, op: Op): ImageBuf {
  let out = img;
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
  return out;
}

export function runPipeline(img: ImageBuf, ops: readonly Op[]): ImageBuf {
  let out = img;
  for (const op of ops) out = applyOp(out, op);
  return out;
}

/**
 * Cache de prefixo do pipeline: guarda o resultado intermediário APÓS cada op.
 * A cada run, reaproveita o maior prefixo comum de ops (comparação por JSON —
 * ops são minúsculas) e só executa a cauda nova. É isso que faz o preview de
 * slider custar UMA op (a do slider) em vez do pipeline inteiro, e o addOp
 * validar sem re-calcular o que o preview já rodou.
 * Custo de memória: 1 ImageBuf por op — aceitável para app pessoal.
 */
export class PipelineCache {
  private base: ImageBuf | null = null;
  private ops: readonly Op[] = [];
  /** stages[i] = resultado após ops[0..i-1]; stages[0] === base */
  private stages: ImageBuf[] = [];

  run(base: ImageBuf, ops: readonly Op[]): ImageBuf {
    if (this.base !== base) {
      this.ops = [];
      this.stages = [base]; // stages[0] é SEMPRE a base
      this.base = base;
    }
    // prefixo reusável NUNCA passa dos estágios já calculados: history.ops é
    // o MESMO array (mutado in-place), então sameOp não percebe push/pop —
    // stages.length é a única verdade sobre o que já foi computado
    let p = 0;
    while (p < ops.length && p + 1 < this.stages.length && sameOp(this.ops[p]!, ops[p]!)) p++;
    this.ops = ops;
    this.stages.length = p + 1;
    let cur = this.stages[p]!;
    for (; p < ops.length; p++) {
      cur = applyOp(cur, ops[p]!);
      this.stages.push(cur);
    }
    return cur;
  }

  invalidate(): void {
    this.ops = [];
    this.stages = [];
    this.base = null;
  }
}

function sameOp(a: Op, b: Op): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Reescala os parâmetros GEOMÉTRICOS de uma op pelo fator f do proxy de
 * preview (D-perf): o preview roda a pipeline inteira sobre uma cópia da
 * original reduzida, e cada op precisa ver coordenadas no sistema do proxy
 * para o resultado ser visualmente equivalente ao de resolução cheia.
 * Switch exaustivo de propósito: op nova com parâmetro de geometria quebra o
 * TS aqui até ser listada — senão o preview mentiria silenciosamente.
 */
export function scaleOp(op: Op, f: number): Op {
  if (f >= 1) return op;
  const px = (v: number) => Math.max(1, Math.round(v * f));
  switch (op.type) {
    case "crop":
      return { ...op, x: Math.round(op.x * f), y: Math.round(op.y * f), width: px(op.width), height: px(op.height) };
    case "resize":
      return { ...op, width: px(op.width), height: px(op.height) };
    case "perspective":
      return {
        ...op,
        quad: {
          tl: [op.quad.tl[0] * f, op.quad.tl[1] * f],
          tr: [op.quad.tr[0] * f, op.quad.tr[1] * f],
          bl: [op.quad.bl[0] * f, op.quad.bl[1] * f],
          br: [op.quad.br[0] * f, op.quad.br[1] * f],
        },
      };
    case "border":
      return { ...op, radius: op.radius * f };
    case "blur":
      return { ...op, sigma: Math.max(0.1, op.sigma * f) };
    case "sharpen":
      return { ...op, sigma: Math.max(0.1, op.sigma * f) };
    case "flip":
    case "rotateZ":
    case "colorGain":
    case "__none__":
      return op;
  }
}
