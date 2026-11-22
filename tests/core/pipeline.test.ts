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

  it("op ainda não implementada falha explicitamente (nunca silencia)", () => {
    const img = alloc(2, 2);
    expect(() => runPipeline(img, [{ type: "crop", x: 0, y: 0, width: 1, height: 1 }])).toThrow(
      "operação 'crop' ainda não implementada",
    );
  });

  it("op desconhecida (dado corrompido na sessão salva) falha explicitamente", () => {
    const img = alloc(2, 2);
    const bogus = { type: "teleporte" } as unknown as Op;
    expect(() => runPipeline(img, [bogus])).toThrow("operação desconhecida");
  });
});
