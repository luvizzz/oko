import { describe, expect, it } from "vitest";
import { alloc, clone, fill, fromData, getPixel, setPixel } from "../../src/core/image";

describe("core/image", () => {
  it("alloc creates a zeroed buffer of the right size", () => {
    const img = alloc(3, 2);
    expect(img.data.length).toBe(24);
    expect(img.data.every((v) => v === 0)).toBe(true);
  });

  it("alloc rejects invalid dimensions", () => {
    expect(() => alloc(0, 5)).toThrow(RangeError);
    expect(() => alloc(2.5, 2)).toThrow(RangeError);
    expect(() => alloc(-1, 1)).toThrow(RangeError);
  });

  it("fromData validates the buffer length", () => {
    expect(() => fromData(2, 2, new Uint8ClampedArray(15))).toThrow(RangeError);
    expect(() => fromData(2, 2, new Uint8ClampedArray(16))).not.toThrow();
  });

  it("clone is independent of the original", () => {
    const a = alloc(2, 1);
    const b = clone(a);
    setPixel(a, 0, 0, 255, 0, 0);
    expect(getPixel(b, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it("set/getPixel map row by row", () => {
    const img = alloc(3, 2);
    setPixel(img, 2, 1, 10, 20, 30, 40); // last row, last column -> index (1*3+2)*4 = 20
    expect(img.data[20]).toBe(10);
    expect(img.data[23]).toBe(40);
    expect(getPixel(img, 2, 1)).toEqual([10, 20, 30, 40]);
  });

  it("getPixel/setPixel reject out of bounds", () => {
    const img = alloc(2, 2);
    expect(() => getPixel(img, 2, 0)).toThrow(RangeError);
    expect(() => setPixel(img, -1, 0, 0, 0, 0)).toThrow(RangeError);
  });

  it("fill fills every pixel (Uint8ClampedArray clamps)", () => {
    const img = alloc(2, 2);
    fill(img, 300, -5, 128);
    expect(getPixel(img, 1, 1)).toEqual([255, 0, 128, 255]);
  });
});
