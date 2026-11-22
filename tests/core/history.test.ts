import { describe, expect, it } from "vitest";
import { History } from "../../src/core/history";
import type { Op } from "../../src/core/pipeline";

const flip: Op = { type: "flip", axis: "x" };
const rot: Op = { type: "rotateZ", degrees: 90 };
const crop: Op = { type: "crop", x: 0, y: 0, width: 4, height: 4 };

describe("core/history", () => {
  it("push entra na pilha; undo remove; redo repõe na mesma ordem", () => {
    const h = new History();
    h.push(flip);
    h.push(rot);
    expect(h.ops).toEqual([flip, rot]);
    expect(h.undo()).toEqual(rot);
    expect(h.ops).toEqual([flip]);
    expect(h.redo()).toEqual(rot);
    expect(h.ops).toEqual([flip, rot]);
  });

  it("operação nova invalida o refazer", () => {
    const h = new History();
    h.push(flip);
    h.undo();
    expect(h.canRedo).toBe(true);
    h.push(crop);
    expect(h.canRedo).toBe(false);
    expect(h.ops).toEqual([crop]);
  });

  it("undo/redo em pilha vazia retornam null (sem exceção)", () => {
    const h = new History();
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
    expect(h.canUndo).toBe(false);
  });

  it("load assume a referência: mutar o histórico mutar o array da sessão", () => {
    const sessionOps: Op[] = [flip];
    const h = new History();
    h.load(sessionOps);
    h.push(rot);
    expect(sessionOps).toEqual([flip, rot]); // mesma referência = sessão salva junto
    h.undo();
    expect(sessionOps).toEqual([flip]);
  });

  it("clear zera mas preserva a referência compartilhada", () => {
    const sessionOps: Op[] = [flip];
    const h = new History();
    h.load(sessionOps);
    h.clear();
    expect(sessionOps).toEqual([]);
    expect(h.ops).toBe(sessionOps);
  });

  it("undo em cascata devolve na ordem inversa (LIFO)", () => {
    const h = new History();
    h.push(flip);
    h.push(rot);
    h.push(crop);
    expect(h.undo()).toEqual(crop);
    expect(h.undo()).toEqual(rot);
    expect(h.undo()).toEqual(flip);
    expect(h.ops).toEqual([]);
  });
});
