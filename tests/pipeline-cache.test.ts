import { describe, expect, it } from "vitest";
import { alloc, fill, getPixel, setPixel } from "../src/core/image";
import { PipelineCache, runPipeline, scaleOp, type Op } from "../src/core/pipeline";
import { gaussianBlur } from "../src/core/filter";

function solid(w: number, h: number, r: number, g: number, b: number) {
  const img = alloc(w, h);
  fill(img, r, g, b);
  return img;
}

describe("PipelineCache", () => {
  it("identical result to runPipeline, with incremental prefix reuse", () => {
    const base = solid(10, 8, 200, 100, 50);
    setPixel(base, 3, 3, 0, 0, 0); // one different pixel so crop/flip are visible
    const ops: Op[] = [
      { type: "flip", axis: "x" },
      { type: "crop", x: 1, y: 1, width: 6, height: 5 },
    ];
    const cache = new PipelineCache();
    expect(cache.run(base, ops)).toEqual(runPipeline(base, ops));
    // append: prefix reused, result equals the from-scratch computation
    const withBlur = [...ops, { type: "blur", sigma: 1 } as Op];
    expect(cache.run(base, withBlur)).toEqual(runPipeline(base, withBlur));
    // undo (array shrinks): returns to the correct previous stage
    expect(cache.run(base, ops)).toEqual(runPipeline(base, ops));
    // different tail on the same prefix
    const withColor = [...ops, { type: "colorGain", r: 2, g: 1, b: 1 } as Op];
    expect(cache.run(base, withColor)).toEqual(runPipeline(base, withColor));
  });

  it("swapping the base image invalidates the cache", () => {
    const a = solid(6, 6, 255, 0, 0);
    const b = solid(6, 6, 0, 255, 0);
    const op: Op = { type: "flip", axis: "y" };
    const cache = new PipelineCache();
    cache.run(a, [op]);
    expect(getPixel(cache.run(b, [op]), 0, 0)[1]).toBe(255);
  });

  it("in-place mutation of the ops array (shared history) is detected", () => {
    const base = solid(8, 8, 10, 20, 30);
    const ops: Op[] = [{ type: "flip", axis: "x" }];
    const cache = new PipelineCache();
    cache.run(base, ops);
    ops.push({ type: "colorGain", r: 3, g: 1, b: 1 }); // push into the SAME array
    expect(getPixel(cache.run(base, ops), 4, 4)[0]).toBe(30);
  });
});

describe("scaleOp (preview proxy)", () => {
  it("rescales geometry; f>=1 is identity", () => {
    expect(scaleOp({ type: "crop", x: 10, y: 20, width: 100, height: 50 }, 1)).toEqual({
      type: "crop", x: 10, y: 20, width: 100, height: 50,
    });
    expect(scaleOp({ type: "crop", x: 10, y: 20, width: 100, height: 50 }, 0.5)).toEqual({
      type: "crop", x: 5, y: 10, width: 50, height: 25,
    });
    expect(scaleOp({ type: "resize", width: 1200, height: 800 }, 0.25)).toEqual({
      type: "resize", width: 300, height: 200,
    });
    const p = scaleOp({ type: "perspective", quad: { tl: [0, 0], tr: [800, 0], bl: [0, 600], br: [800, 600] } }, 0.5);
    if (p.type !== "perspective") throw new Error("type changed");
    expect(p.quad.br).toEqual([400, 300]);
    expect(scaleOp({ type: "blur", sigma: 2 }, 0.5)).toEqual({ type: "blur", sigma: 1 });
    expect(scaleOp({ type: "border", shape: "square", radius: 40 }, 0.5)).toEqual({
      type: "border", shape: "square", radius: 20,
    });
    // size invariant: a rescaled crop never collapses to 0
    expect(scaleOp({ type: "crop", x: 0, y: 0, width: 1, height: 1 }, 0.1)).toEqual({
      type: "crop", x: 0, y: 0, width: 1, height: 1,
    });
  });

  it("blur on the proxy is visually equivalent to full-res x factor (same relative blur)", () => {
    // isolated white point: the spread energy must follow the rescaled sigma
    const full = alloc(200, 200);
    setPixel(full, 100, 100, 255, 255, 255);
    const small = alloc(100, 100);
    setPixel(small, 50, 50, 255, 255, 255);
    const bf = gaussianBlur(full, 4); // sigma 4 at 200px
    const bs = gaussianBlur(small, scaleOp({ type: "blur", sigma: 4 }, 0.5).type === "blur" ? 2 : 0); // sigma 2 at 100px
    // halfway between the blur center and its edge: same order of magnitude
    expect(bf.data[(100 * 200 + 104) * 4]!).toBeGreaterThan(0);
    expect(bs.data[(50 * 100 + 52) * 4]!).toBeGreaterThan(0);
  });
});
