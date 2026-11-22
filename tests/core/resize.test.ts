import { describe, expect, it } from "vitest";
import { alloc, fromData, getPixel, setPixel, type ImageBuf } from "../../src/core/image";
import { lanczosResize } from "../../src/core/resize";

function constant(w: number, h: number, v: number): ImageBuf {
  const img = alloc(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  return img;
}

describe("core/resize (Lanczos3)", () => {
  it("same dimensions = exact copy", () => {
    const img = fromData(3, 2, Uint8ClampedArray.from([...Array(24)].map((_, i) => i)));
    const out = lanczosResize(img, 3, 2);
    expect(out.data).toEqual(img.data);
  });

  it("constant color preserved exactly in upscale and downscale (DC gain = 1)", () => {
    for (const [w, h] of [[8, 8], [32, 16], [17, 9], [100, 3]] as const) {
      const out = lanczosResize(constant(16, 8, 200), w, h);
      expect(out.width).toBe(w);
      expect(out.height).toBe(h);
      for (let i = 0; i < out.data.length; i += 4) {
        expect(out.data[i]).toBe(200);
        expect(out.data[i + 3]).toBe(255);
      }
    }
  });

  it("vertical step: smooth bounded transition (no NaN → 0, no absurd values)", () => {
    // left half black, right half white
    const img = alloc(16, 4);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 16; x++) setPixel(img, x, y, x < 8 ? 0 : 255, 0, 0);
    const out = lanczosResize(img, 32, 8);
    const left = getPixel(out, 4, 4)[0];
    const right = getPixel(out, 27, 4)[0];
    const edge = getPixel(out, 16, 4)[0];
    expect(left).toBeLessThan(5); // black interior stays black
    expect(right).toBeGreaterThan(250);
    expect(edge).toBeGreaterThan(5); // interpolated at the edge
    expect(edge).toBeLessThan(250);
  });

  it("heavy 8:1 downscale doesn't turn to garbage (kernel area covers the window)", () => {
    // 64x64 checkerboard gray/black -> average ~gray
    const img = alloc(64, 64);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const v = (x + y) % 2 === 0 ? 128 : 0;
        setPixel(img, x, y, v, v, v);
      }
    const out = lanczosResize(img, 8, 8);
    const m = getPixel(out, 4, 4)[0];
    expect(m).toBeGreaterThan(30); // didn't collapse to black (aliasing)
    expect(m).toBeLessThan(120); // nor blew out upward
  });

  it("rejects invalid destination", () => {
    const img = alloc(4, 4);
    expect(() => lanczosResize(img, 0, 2)).toThrow(RangeError);
    expect(() => lanczosResize(img, 2.5, 2)).toThrow(RangeError);
  });
});
