import { describe, expect, it } from "vitest";
import { alloc, getPixel, setPixel, type ImageBuf } from "../../src/core/image";
import { perspective } from "../../src/core/perspective";

function split(w: number, h: number): ImageBuf {
  // left half white, right half black
  const img = alloc(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = x < w / 2 ? 255 : 0;
      setPixel(img, x, y, v, v, v);
    }
  return img;
}

describe("core/perspective", () => {
  it("quadrilateral = original rectangle → identity (bilinear exact on integers)", () => {
    const img = split(64, 32);
    const out = perspective(img, { tl: [0, 0], tr: [64, 0], bl: [0, 32], br: [64, 32] });
    expect(Math.abs(out.width - 64)).toBeLessThanOrEqual(1);
    expect(Math.abs(out.height - 32)).toBeLessThanOrEqual(1);
    expect(getPixel(out, 10, 16)[0]).toBe(255);
    expect(getPixel(out, 50, 16)[0]).toBe(0);
  });

  it("keystone to the right: trapezoid with a narrow side and slanted top", () => {
    const img = split(100, 100);
    // right side of the quad at half the height -> trapezoid (perspective)
    const out = perspective(img, { tl: [0, 0], tr: [80, 25], bl: [0, 100], br: [80, 75] });
    expect(out.width).toBe(80);
    expect(out.height).toBe(100);
    const alpha = (x: number, y: number) => getPixel(out, x, y)[3];
    // slanted top: at x=40 the top edge sits at y≈12.5
    expect(alpha(40, 5)).toBe(0); // above the slanted top -> transparent
    expect(alpha(40, 20)).toBeGreaterThan(0);
    // compressed right side: near the x=75 edge only the middle band (25..75) exists
    expect(alpha(75, 10)).toBe(0);
    expect(alpha(75, 50)).toBeGreaterThan(0);
    // white/black boundary: under perspective the PARAMETER is not preserved — the
    // source line x=50 lands AFTER the midpoint (40) because the "far" side
    // (right, compressed) concentrates the right-hand points
    const row = 50;
    let boundary = -1;
    for (let x = 1; x < out.width; x++) {
      if (getPixel(out, x - 1, row)[0] > 128 && getPixel(out, x, row)[0] < 128) {
        boundary = x;
        break;
      }
    }
    expect(boundary).toBeGreaterThan(40); // non-affine: shifted beyond the midpoint
    expect(boundary).toBeLessThan(65);
  });

  it("content touches all 4 canvas edges (transparent trim)", () => {
    const img = split(50, 40);
    const out = perspective(img, { tl: [10, 0], tr: [60, 15], bl: [0, 55], br: [70, 40] });
    const opaque = (x: number, y: number) => getPixel(out, x, y)[3] > 0;
    let left = false, right = false, top = false, bottom = false;
    for (let y = 0; y < out.height; y++) {
      if (opaque(0, y)) left = true;
      if (opaque(out.width - 1, y)) right = true;
    }
    for (let x = 0; x < out.width; x++) {
      if (opaque(x, 0)) top = true;
      if (opaque(x, out.height - 1)) bottom = true;
    }
    expect([left, right, top, bottom]).toEqual([true, true, true, true]);
  });

  it("degenerate quadrilateral (everything on the same point) fails explicitly", () => {
    const img = alloc(10, 10);
    expect(() => perspective(img, { tl: [0, 0], tr: [0, 0], bl: [0, 0], br: [0, 0] })).toThrow(RangeError);
  });
});
