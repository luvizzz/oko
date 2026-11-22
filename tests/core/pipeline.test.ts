import { describe, expect, it } from "vitest";
import { alloc } from "../../src/core/image";
import { runPipeline, type Op } from "../../src/core/pipeline";

describe("core/pipeline", () => {
  it("lista vazia retorna a imagem sem tocar", () => {
    const img = alloc(2, 2);
    expect(runPipeline(img, [])).toBe(img);
  });

  it("__none__ é no-op", () => {
    const img = alloc(2, 2);
    expect(runPipeline(img, [{ type: "__none__" }])).toBe(img);
  });

  it("op ainda não implementada (M3/M4) falha explicitamente (nunca silencia)", () => {
    const img = alloc(2, 2);
    expect(() => runPipeline(img, [{ type: "perspective", corners: [0, 0, 1, 1] }])).toThrow(
      "operação 'perspective' ainda não implementada",
    );
  });

  it("encadeia ops M2 de ponta a ponta", () => {
    const img = alloc(4, 2);
    const out = runPipeline(img, [
      { type: "crop", x: 0, y: 0, width: 4, height: 2 },
      { type: "rotateZ", degrees: 90 },
      { type: "flip", axis: "x" },
      { type: "resize", width: 2, height: 2 },
    ]);
    expect(out.width).toBe(2);
    expect(out.height).toBe(2);
  });

  it("op desconhecida (dado corrompido na sessão salva) falha explicitamente", () => {
    const img = alloc(2, 2);
    const bogus = { type: "teleporte" } as unknown as Op;
    expect(() => runPipeline(img, [bogus])).toThrow("operação desconhecida");
  });
});
