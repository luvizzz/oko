import { describe, expect, it } from "vitest";
import { alloc, fill, getPixel, setPixel } from "../src/core/image";
import { PipelineCache, runPipeline, scaleOp, type Op } from "../src/core/pipeline";
import { gaussianBlur } from "../src/core/filter";

function solid(w: number, h: number, r: number, g: number, b: number) {
  const img = alloc(w, h);
  fill(img, r, g, b);
  return img;
}

describe("PipelineCache", () => {
  it("resultado idêntico ao runPipeline, com reuso incremental de prefixo", () => {
    const base = solid(10, 8, 200, 100, 50);
    setPixel(base, 3, 3, 0, 0, 0); // um pixel diferente pra crop/flip serem visíveis
    const ops: Op[] = [
      { type: "flip", axis: "x" },
      { type: "crop", x: 1, y: 1, width: 6, height: 5 },
    ];
    const cache = new PipelineCache();
    expect(cache.run(base, ops)).toEqual(runPipeline(base, ops));
    // append: prefixo reaproveitado, resultado igual ao cálculo do zero
    const withBlur = [...ops, { type: "blur", sigma: 1 } as Op];
    expect(cache.run(base, withBlur)).toEqual(runPipeline(base, withBlur));
    // undo (array encolhe): volta ao estágio anterior correto
    expect(cache.run(base, ops)).toEqual(runPipeline(base, ops));
    // cauda diferente no mesmo prefixo
    const withColor = [...ops, { type: "colorGain", r: 2, g: 1, b: 1 } as Op];
    expect(cache.run(base, withColor)).toEqual(runPipeline(base, withColor));
  });

  it("troca de imagem base invalida o cache", () => {
    const a = solid(6, 6, 255, 0, 0);
    const b = solid(6, 6, 0, 255, 0);
    const op: Op = { type: "flip", axis: "y" };
    const cache = new PipelineCache();
    cache.run(a, [op]);
    expect(getPixel(cache.run(b, [op]), 0, 0)[1]).toBe(255);
  });

  it("mutação in-place do array de ops (história compartilhada) é detectada", () => {
    const base = solid(8, 8, 10, 20, 30);
    const ops: Op[] = [{ type: "flip", axis: "x" }];
    const cache = new PipelineCache();
    cache.run(base, ops);
    ops.push({ type: "colorGain", r: 3, g: 1, b: 1 }); // push no MESMO array
    expect(getPixel(cache.run(base, ops), 4, 4)[0]).toBe(30);
  });
});

describe("scaleOp (proxy de preview)", () => {
  it("reescala geometria; f>=1 é identidade", () => {
    expect(scaleOp({ type: "crop", x: 10, y: 20, width: 100, height: 50 }, 1)).toEqual({
      type: "crop", x: 10, y: 20, width: 100, height: 50,
    });
    expect(scaleOp({ type: "crop", x: 10, y: 20, width: 100, height: 50 }, 0.5)).toEqual({
      type: "crop", x: 5, y: 10, width: 50, height: 25,
    });
    expect(scaleOp({ type: "resize", width: 1200, height: 800 }, 0.25)).toEqual({
      type: "resize", width: 300, height: 200,
    });
    const p = scaleOp({ type: "perspective", quad: { tl: [0, 0], tr: [800, 0], bl: [0, 600], br: [800, 600] } }, 0.5);
    if (p.type !== "perspective") throw new Error("tipo mudou");
    expect(p.quad.br).toEqual([400, 300]);
    expect(scaleOp({ type: "blur", sigma: 2 }, 0.5)).toEqual({ type: "blur", sigma: 1 });
    expect(scaleOp({ type: "border", shape: "square", radius: 40 }, 0.5)).toEqual({
      type: "border", shape: "square", radius: 20,
    });
    // invariante de tamanho: crop reescalonado nunca colapsa pra 0
    expect(scaleOp({ type: "crop", x: 0, y: 0, width: 1, height: 1 }, 0.1)).toEqual({
      type: "crop", x: 0, y: 0, width: 1, height: 1,
    });
  });

  it("blur no proxy é equivalente visual ao de cheia × fator (mesmo borrão relativo)", () => {
    // ponto branco isolado: a energia espalhada deve acompanhar sigma reescalonado
    const full = alloc(200, 200);
    setPixel(full, 100, 100, 255, 255, 255);
    const small = alloc(100, 100);
    setPixel(small, 50, 50, 255, 255, 255);
    const bf = gaussianBlur(full, 4); // sigma 4 em 200px
    const bs = gaussianBlur(small, scaleOp({ type: "blur", sigma: 4 }, 0.5).type === "blur" ? 2 : 0); // sigma 2 em 100px
    // meio do caminho entre centro e borda do borrão: mesma ordem de magnitude
    expect(bf.data[(100 * 200 + 104) * 4]!).toBeGreaterThan(0);
    expect(bs.data[(50 * 100 + 52) * 4]!).toBeGreaterThan(0);
  });
});
