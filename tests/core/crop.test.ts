import { describe, expect, it } from "vitest";
import { alloc, getPixel, setPixel } from "../../src/core/image";
import { crop } from "../../src/core/crop";

function grid(w: number, h: number) {
  const img = alloc(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPixel(img, x, y, x * 10, y * 10, 0);
  return img;
}

describe("core/crop", () => {
  it("extracts the correct subregion", () => {
    const out = crop(grid(4, 3), 1, 1, 2, 2);
    expect(out.width).toBe(2);
    expect(out.height).toBe(2);
    expect(getPixel(out, 0, 0)).toEqual([10, 10, 0, 255]); // source (1,1)
    expect(getPixel(out, 1, 1)).toEqual([20, 20, 0, 255]); // source (2,2)
  });

  it("cropping the whole image is identity", () => {
    const img = grid(3, 2);
    expect(crop(img, 0, 0, 3, 2).data).toEqual(img.data);
  });

  it("rejects out-of-bounds, empty area and fractional coordinates", () => {
    const img = grid(4, 4);
    expect(() => crop(img, 3, 3, 2, 2)).toThrow(RangeError);
    expect(() => crop(img, -1, 0, 2, 2)).toThrow(RangeError);
    expect(() => crop(img, 0, 0, 0, 5)).toThrow(RangeError);
    expect(() => crop(img, 0.5, 0, 2, 2)).toThrow(RangeError);
  });
});
