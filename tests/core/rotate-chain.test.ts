import { describe, expect, it } from "vitest";
import { alloc, setPixel, type ImageBuf } from "../../src/core/image";
import { rotateZ } from "../../src/core/rotate";

function solid(w: number, h: number): ImageBuf {
  const img = alloc(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 200;
    img.data[i + 1] = 32;
    img.data[i + 2] = 64;
    img.data[i + 3] = 255;
  }
  return img;
}

function opaqueArea(img: ImageBuf): number {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! > 0) n++;
  return n;
}

describe("rotações encadeadas voltam ao original (bug relatado)", () => {
  for (const seq of [[15, 15, -30], [-15, -15, 30]] as const) {
    it(`${seq.join(", ")}° preserva a imagem e volta ao tamanho`, () => {
      let img = solid(101, 61);
      for (const deg of seq) img = rotateZ(img, deg);
      const area = opaqueArea(img);
      expect(area).toBeGreaterThan(6161 * 0.9); // conteúdo preservado
      // rotação líquida 0°: margens aparadas -> canvas ~original.
      // tolerância ±5px: cada resampling estende a borda ~1px (edge extension), esperado.
      expect(Math.abs(img.width - 101)).toBeLessThanOrEqual(5);
      expect(Math.abs(img.height - 61)).toBeLessThanOrEqual(5);
      console.log(`seq ${seq}: canvas final ${img.width}x${img.height}, opacos=${area}`);
    });
  }
});
