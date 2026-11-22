import { describe, expect, it } from "vitest";
import { alloc, getPixel, setPixel, type ImageBuf } from "../../src/core/image";
import { rotateZ } from "../../src/core/rotate";

/** 4x2 with a unique color per pixel: value = x + y*10 */
function pattern(): ImageBuf {
  const img = alloc(4, 2);
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 4; x++) {
      const v = x + y * 10;
      setPixel(img, x, y, v, 0, 0);
    }
  return img;
}

describe("core/rotateZ", () => {
  it("0° and 360° are identity", () => {
    const img = pattern();
    expect(rotateZ(img, 0).data).toEqual(img.data);
    expect(rotateZ(img, 360).data).toEqual(img.data);
  });

  it("90° clockwise: TL→TR, BL→TL; dimensions swap", () => {
    const out = rotateZ(pattern(), 90);
    expect(out.width).toBe(2);
    expect(out.height).toBe(4);
    expect(getPixel(out, 1, 0)).toEqual([0, 0, 0, 255]); // src TL (0,0)
    expect(getPixel(out, 0, 0)).toEqual([10, 0, 0, 255]); // src BL (0,1)
    expect(getPixel(out, 0, 3)).toEqual([13, 0, 0, 255]); // src BR (3,1) → BL
  });

  it("180° flips both axes", () => {
    const out = rotateZ(pattern(), 180);
    expect(out.width).toBe(4);
    expect(out.height).toBe(2);
    expect(getPixel(out, 0, 0)).toEqual([13, 0, 0, 255]); // src BR (3,1): v=3+10=13
  });

  it("270°: sequence of 4x90° = identity", () => {
    let img: ImageBuf = pattern();
    const original = new Uint8ClampedArray(img.data);
    for (let i = 0; i < 4; i++) img = rotateZ(img, 90);
    expect(img.width).toBe(4);
    expect(img.data).toEqual(original);
  });

  it("45°: canvas expands, center preserved, corners become transparent", () => {
    const img = alloc(101, 101);
    // white background, red center
    for (let y = 0; y < 101; y++) for (let x = 0; x < 101; x++) setPixel(img, x, y, 255, 255, 255);
    setPixel(img, 50, 50, 255, 0, 0);
    const out = rotateZ(img, 45);
    expect(out.width).toBeGreaterThan(101);
    expect(out.height).toBeGreaterThan(101);
    const c = Math.floor(out.height / 2);
    const cx = Math.floor(out.width / 2);
    expect(getPixel(out, cx, c)[0]).toBe(255); // center → red preserved
    expect(getPixel(out, 0, 0)[3]).toBe(0); // corner outside the source → alpha 0
  });
});
