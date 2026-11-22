import { describe, expect, it } from "vitest";
import { alloc, fromData, getPixel, setPixel, type ImageBuf } from "../../src/core/image";
import { flip } from "../../src/core/flip";

function pattern2x2(): ImageBuf {
  // TL=vermelho  TR=verde
  // BL=azul      BR=branco
  const img = alloc(2, 2);
  setPixel(img, 0, 0, 255, 0, 0);
  setPixel(img, 1, 0, 0, 255, 0);
  setPixel(img, 0, 1, 0, 0, 255);
  setPixel(img, 1, 1, 255, 255, 255);
  return img;
}

describe("core/flip", () => {
  it("flip x troca esquerda↔direita", () => {
    const out = flip(pattern2x2(), "x");
    expect(getPixel(out, 0, 0)).toEqual([0, 255, 0, 255]); // verde foi p/ esquerda
    expect(getPixel(out, 1, 1)).toEqual([0, 0, 255, 255]);
  });

  it("flip y troca cima↔baixo", () => {
    const out = flip(pattern2x2(), "y");
    expect(getPixel(out, 0, 0)).toEqual([0, 0, 255, 255]); // azul subiu
    expect(getPixel(out, 1, 0)).toEqual([255, 255, 255, 255]);
  });

  it("flip duas vezes = identidade", () => {
    const img = pattern2x2();
    expect(flip(flip(img, "x"), "x").data).toEqual(img.data);
    expect(flip(flip(img, "y"), "y").data).toEqual(img.data);
  });

  it("não muta a imagem de entrada", () => {
    const img = pattern2x2();
    const before = new Uint8ClampedArray(img.data);
    flip(img, "x");
    expect(img.data).toEqual(before);
  });
});
