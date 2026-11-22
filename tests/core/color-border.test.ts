import { describe, expect, it } from "vitest";
import { alloc, getPixel, setPixel } from "../../src/core/image";
import { colorGain } from "../../src/core/color";
import { border } from "../../src/core/border";

function base() {
  const img = alloc(4, 4);
  fill(img, 100, 150, 200, 255);
  return img;
}
function fill(img: ReturnType<typeof alloc>, r: number, g: number, b: number, a: number) {
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = a;
  }
  return img;
}

describe("core/color", () => {
  it("gain 1 = identity", () => {
    expect(colorGain(base(), 1, 1, 1).data).toEqual(base().data);
  });

  it("channels are independent: only red changes", () => {
    const out = colorGain(base(), 0.5, 1, 1);
    expect(getPixel(out, 2, 2)).toEqual([50, 150, 200, 255]);
  });

  it("gain 0 zeroes the channel; gain 2 saturates at the clamp", () => {
    expect(getPixel(colorGain(base(), 0, 1, 1), 1, 1)).toEqual([0, 150, 200, 255]);
    expect(getPixel(colorGain(base(), 2, 2, 2), 1, 1)).toEqual([200, 255, 255, 255]);
  });

  it("alpha is never touched", () => {
    const img = alloc(2, 2);
    setPixel(img, 0, 0, 100, 100, 100, 128);
    expect(getPixel(colorGain(img, 3, 3, 3), 0, 0)[3]).toBe(128);
  });

  it("invalid gain fails", () => {
    expect(() => colorGain(base(), -1, 1, 1)).toThrow(RangeError);
    expect(() => colorGain(base(), NaN, 1, 1)).toThrow(RangeError);
  });
});

describe("core/border", () => {
  it("square radius 0 = intact; radius > 0 trims only the corners", () => {
    const img = alloc(100, 100);
    fill(img, 10, 20, 30, 255);
    expect(border(img, "square", 0).data).toEqual(img.data);
    const out = border(img, "square", 20);
    expect(getPixel(out, 0, 0)[3]).toBe(0); // corner cut off
    expect(getPixel(out, 50, 0)[3]).toBe(255); // middle of the side intact
    expect(getPixel(out, 50, 50)[3]).toBe(255);
    expect(getPixel(out, 25, 0)[3]).toBe(255); // far enough from the radius
  });

  it("oval: center intact, corners zero, middle of the sides exists", () => {
    const out = border(alloc100(), "oval", 0);
    expect(getPixel(out, 50, 50)[3]).toBe(255);
    expect(getPixel(out, 0, 0)[3]).toBe(0);
    expect(getPixel(out, 50, 1)[3]).toBeGreaterThan(0); // top, middle of the side
    expect(getPixel(out, 1, 50)[3]).toBeGreaterThan(0);
  });

  it("circle: cuts the corner AND the middle of the long side on a non-square image", () => {
    const img = alloc(100, 60);
    fill(img, 10, 20, 30, 255);
    const out = border(img, "circle", 0);
    expect(getPixel(out, 50, 30)[3]).toBe(255); // center
    expect(getPixel(out, 99, 30)[3]).toBe(0); // middle of the right side: outside the circle
    expect(getPixel(out, 0, 0)[3]).toBe(0);
  });

  it("existing transparency is preserved (multiplies alpha)", () => {
    const img = alloc(20, 20);
    fill(img, 10, 10, 10, 128);
    const out = border(img, "circle", 0);
    expect(getPixel(out, 10, 10)[3]).toBe(128);
    expect(getPixel(out, 0, 0)[3]).toBe(0);
  });

  function alloc100() {
    const img = alloc(100, 100);
    fill(img, 10, 20, 30, 255);
    return img;
  }
});
