/**
 * core/pipeline.ts — oko's editing is a LIST of pure operations:
 * the app state = original image + ops. Undo/redo and session persistence
 * derive from that for free — we never store pixel snapshots.
 * The list of op types grows as features land; unknown op = explicit error.
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
  | { type: "resize"; width: number; height: number }
  | { type: "crop"; x: number; y: number; width: number; height: number }
  | { type: "rotateZ"; degrees: number }
  | { type: "flip"; axis: "x" | "y" }
  | { type: "perspective"; quad: Quad }
  | { type: "colorGain"; r: number; g: number; b: number }
  | { type: "border"; shape: BorderShape; radius: number }
  | { type: "blur"; sigma: number }
  | { type: "sharpen"; amount: number; sigma: number }
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
      const t: never = op; // exhaustiveness: TS breaks when a new Op enters without a case
      throw new Error(`unknown operation: ${JSON.stringify(t)}`);
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
 * Pipeline prefix cache: stores the intermediate result AFTER each op.
 * Each run reuses the longest common prefix of ops (compared by JSON —
 * ops are tiny) and only executes the new tail. This is what makes the slider
 * preview cost ONE op (the slider's) instead of the whole pipeline, and lets
 * addOp validate without recomputing what the preview already ran.
 * Memory cost: 1 ImageBuf per op — acceptable for a personal app.
 */
export class PipelineCache {
  private base: ImageBuf | null = null;
  private ops: readonly Op[] = [];
  /** stages[i] = result after ops[0..i-1]; stages[0] === base */
  private stages: ImageBuf[] = [];

  run(base: ImageBuf, ops: readonly Op[]): ImageBuf {
    if (this.base !== base) {
      this.ops = [];
      this.stages = [base]; // stages[0] is ALWAYS the base
      this.base = base;
    }
    // reusable prefix NEVER goes past the already-computed stages: history.ops is
    // the SAME array (mutated in-place), so sameOp doesn't notice push/pop —
    // stages.length is the only truth about what has already been computed
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
 * Rescales the GEOMETRIC parameters of an op by the preview proxy's factor f:
 * the preview runs the whole pipeline over a downscaled copy of the original,
 * and each op must see coordinates in the proxy's coordinate system for the
 * result to be visually equivalent to the full-resolution one.
 * Exhaustive switch on purpose: a new op with a geometry parameter breaks TS
 * here until it's listed — otherwise the preview would silently lie.
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
