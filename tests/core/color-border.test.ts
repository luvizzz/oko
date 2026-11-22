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
  it("ganho 1 = identidade", () => {
    expect(colorGain(base(), 1, 1, 1).data).toEqual(base().data);
  });

  it("canais são independentes: só o vermelho muda", () => {
    const out = colorGain(base(), 0.5, 1, 1);
    expect(getPixel(out, 2, 2)).toEqual([50, 150, 200, 255]);
  });

  it("ganho 0 zera o canal; ganho 2 satura no clamp", () => {
    expect(getPixel(colorGain(base(), 0, 1, 1), 1, 1)).toEqual([0, 150, 200, 255]);
    expect(getPixel(colorGain(base(), 2, 2, 2), 1, 1)).toEqual([200, 255, 255, 255]);
  });

  it("alfa nunca é tocado", () => {
    const img = alloc(2, 2);
    setPixel(img, 0, 0, 100, 100, 100, 128);
    expect(getPixel(colorGain(img, 3, 3, 3), 0, 0)[3]).toBe(128);
  });

  it("ganho inválido falha", () => {
    expect(() => colorGain(base(), -1, 1, 1)).toThrow(RangeError);
    expect(() => colorGain(base(), NaN, 1, 1)).toThrow(RangeError);
  });
});

describe("core/border", () => {
  it("quadrada raio 0 = intacta; raio > 0 recorta só os cantos", () => {
    const img = alloc(100, 100);
    fill(img, 10, 20, 30, 255);
    expect(border(img, "square", 0).data).toEqual(img.data);
    const out = border(img, "square", 20);
    expect(getPixel(out, 0, 0)[3]).toBe(0); // canto cortado
    expect(getPixel(out, 50, 0)[3]).toBe(255); // meio do lado intacto
    expect(getPixel(out, 50, 50)[3]).toBe(255);
    expect(getPixel(out, 25, 0)[3]).toBe(255); // longe o bastante do raio
  });

  it("oval: centro intacto, cantos zero, meio dos lados existe", () => {
    const out = border(alloc100(), "oval", 0);
    expect(getPixel(out, 50, 50)[3]).toBe(255);
    expect(getPixel(out, 0, 0)[3]).toBe(0);
    expect(getPixel(out, 50, 1)[3]).toBeGreaterThan(0); // topo, centro do lado
    expect(getPixel(out, 1, 50)[3]).toBeGreaterThan(0);
  });

  it("círculo: corta o canto E o meio do lado longo em imagem não-quadrada", () => {
    const img = alloc(100, 60);
    fill(img, 10, 20, 30, 255);
    const out = border(img, "circle", 0);
    expect(getPixel(out, 50, 30)[3]).toBe(255); // centro
    expect(getPixel(out, 99, 30)[3]).toBe(0); // meio do lado direito: fora do círculo
    expect(getPixel(out, 0, 0)[3]).toBe(0);
  });

  it("transparência anterior é preservada (multiplica alfa)", () => {
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
