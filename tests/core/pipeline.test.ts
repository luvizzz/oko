import { describe, expect, it } from "vitest";
import { alloc } from "../../src/core/image";
import { runPipeline, type Op } from "../../src/core/pipeline";

describe("core/pipeline", () => {
  it("empty list returns the image untouched", () => {
    const img = alloc(2, 2);
    expect(runPipeline(img, [])).toBe(img);
  });

  it("__none__ is a no-op", () => {
    const img = alloc(2, 2);
    expect(runPipeline(img, [{ type: "__none__" }])).toBe(img);
  });

  it("chains ops end to end", () => {
    const img = alloc(4, 2);
    const out = runPipeline(img, [
      { type: "crop", x: 0, y: 0, width: 4, height: 2 },
      { type: "rotateZ", degrees: 90 },
      { type: "flip", axis: "x" },
      { type: "resize", width: 2, height: 2 },
    ]);
    expect(out.width).toBe(2);
    expect(out.height).toBe(2);
  });

  it("unknown op (corrupted data in a saved session) fails explicitly", () => {
    const img = alloc(2, 2);
    const bogus = { type: "teleport" } as unknown as Op;
    expect(() => runPipeline(img, [bogus])).toThrow("unknown operation");
  });
});
