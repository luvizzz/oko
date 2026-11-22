import { describe, expect, it } from "vitest";
import { alloc, getPixel, setPixel } from "../../src/core/image";
import { gaussianBlur, gaussianKernel, sharpen } from "../../src/core/filter";

function constant(w: number, h: number, v = 120) {
  const img = alloc(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  return img;
}

describe("gaussianKernel", () => {
  it("normalized weights (sum 1), symmetric, center maximum", () => {
    const { w, radius } = gaussianKernel(2);
    let sum = 0;
    for (let i = 0; i < w.length; i++) sum += w[i]!;
    expect(sum).toBeCloseTo(1, 6); // Float32: ~7 digits of precision
    expect(w.length).toBe(2 * radius + 1);
    expect(w[radius]).toBeGreaterThan(w[radius - 1]!);
    expect(w[radius + 1]).toBe(w[radius - 1]);
  });

  it("invalid sigma fails", () => {
    expect(() => gaussianKernel(0)).toThrow(RangeError);
    expect(() => gaussianKernel(-1)).toThrow(RangeError);
    expect(() => gaussianKernel(NaN)).toThrow(RangeError);
  });
});

describe("gaussianBlur", () => {
  it("constant image is unchanged (normalized kernel + edge extension)", () => {
    const img = constant(20, 20, 120);
    const out = gaussianBlur(img, 3);
    expect(out.data).toEqual(img.data);
  });

  it("impulse spreads energy to the neighbors", () => {
    const img = constant(21, 5, 0);
    setPixel(img, 10, 2, 255, 255, 255, 255);
    const out = gaussianBlur(img, 1.5);
    const center = getPixel(out, 10, 2)[0];
    const near = getPixel(out, 11, 2)[0];
    expect(center).toBeLessThan(255);
    expect(near).toBeGreaterThan(0);
    expect(center).toBeGreaterThan(near); // decaying bell curve
  });

  it("no energy leaks through the edge (edge extension: white stays white)", () => {
    const out = gaussianBlur(constant(10, 10, 255), 4);
    expect(getPixel(out, 0, 0)[0]).toBe(255);
    expect(getPixel(out, 9, 9)[0]).toBe(255);
  });
});

describe("sharpen (unsharp masking)", () => {
  it("amount 0 = identity", () => {
    const img = constant(8, 8, 90);
    expect(sharpen(img, 0).data).toEqual(img.data);
  });

  it("luminance step gains overshoot/undershoot at the edge (enhanced contrast)", () => {
    const img = alloc(16, 3);
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 16; x++) setPixel(img, x, y, x < 8 ? 100 : 200, 0, 0, 255);
    const out = sharpen(img, 1, 1.5);
    // dark side next to the edge: below 100 (undershoot)
    expect(getPixel(out, 7, 1)[0]).toBeLessThan(100);
    // light side next to the edge: above 200 (overshoot)
    expect(getPixel(out, 8, 1)[0]).toBeGreaterThan(200);
    // far from the edge: nearly intact
    expect(Math.abs(getPixel(out, 0, 1)[0] - 100)).toBeLessThanOrEqual(2);
  });

  it("invalid amount fails", () => {
    expect(() => sharpen(constant(4, 4), -0.5)).toThrow(RangeError);
  });
});
