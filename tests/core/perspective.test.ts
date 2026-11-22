import { describe, expect, it } from "vitest";
import { alloc, getPixel, setPixel, type ImageBuf } from "../../src/core/image";
import { perspective } from "../../src/core/perspective";

function split(w: number, h: number): ImageBuf {
  // metade esquerda branca, direita preta
  const img = alloc(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = x < w / 2 ? 255 : 0;
      setPixel(img, x, y, v, v, v);
    }
  return img;
}

describe("core/perspective", () => {
  it("quadrilátero = retângulo original → identidade (bilinear exata em inteiros)", () => {
    const img = split(64, 32);
    const out = perspective(img, { tl: [0, 0], tr: [64, 0], bl: [0, 32], br: [64, 32] });
    expect(Math.abs(out.width - 64)).toBeLessThanOrEqual(1);
    expect(Math.abs(out.height - 32)).toBeLessThanOrEqual(1);
    expect(getPixel(out, 10, 16)[0]).toBe(255);
    expect(getPixel(out, 50, 16)[0]).toBe(0);
  });

  it("keystone à direita: trapézio com lado estreito e topo inclinado", () => {
    const img = split(100, 100);
    // lado direito do quadrilátero com metade da altura -> trapézio (perspectiva)
    const out = perspective(img, { tl: [0, 0], tr: [80, 25], bl: [0, 100], br: [80, 75] });
    expect(out.width).toBe(80);
    expect(out.height).toBe(100);
    const alpha = (x: number, y: number) => getPixel(out, x, y)[3];
    // topo inclinado: em x=40 a borda de cima está em y≈12.5
    expect(alpha(40, 5)).toBe(0); // acima do topo inclinado -> transparente
    expect(alpha(40, 20)).toBeGreaterThan(0);
    // lado direito comprimido: perto da borda x=75 só a faixa central (25..75) existe
    expect(alpha(75, 10)).toBe(0);
    expect(alpha(75, 50)).toBeGreaterThan(0);
    // fronteira branco/preto: em perspectiva o PARÂMETRO não é preservado — a
    // linha x=50 da origem cai DEPOIS do ponto médio (40) porque o lado
    // "distante" (direito, comprimido) concentra os pontos da direita
    const row = 50;
    let boundary = -1;
    for (let x = 1; x < out.width; x++) {
      if (getPixel(out, x - 1, row)[0] > 128 && getPixel(out, x, row)[0] < 128) {
        boundary = x;
        break;
      }
    }
    expect(boundary).toBeGreaterThan(40); // não-afim: deslocou além do ponto médio
    expect(boundary).toBeLessThan(65);
  });

  it("conteúdo encosta nas 4 bordas do canvas (trim transparente)", () => {
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

  it("quadrilátero degenerado (tudo no mesmo ponto) falha explicitamente", () => {
    const img = alloc(10, 10);
    expect(() => perspective(img, { tl: [0, 0], tr: [0, 0], bl: [0, 0], br: [0, 0] })).toThrow(RangeError);
  });
});
