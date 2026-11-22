import { describe, expect, it } from "vitest";
import { History } from "../../src/core/history";
import type { Op } from "../../src/core/pipeline";

const flip: Op = { type: "flip", axis: "x" };
const rot: Op = { type: "rotateZ", degrees: 90 };
const crop: Op = { type: "crop", x: 0, y: 0, width: 4, height: 4 };

describe("core/history", () => {
  it("push enters the stack; undo removes; redo restores in the same order", () => {
    const h = new History();
    h.push(flip);
    h.push(rot);
    expect(h.ops).toEqual([flip, rot]);
    expect(h.undo()).toEqual(rot);
    expect(h.ops).toEqual([flip]);
    expect(h.redo()).toEqual(rot);
    expect(h.ops).toEqual([flip, rot]);
  });

  it("a new operation invalidates redo", () => {
    const h = new History();
    h.push(flip);
    h.undo();
    expect(h.canRedo).toBe(true);
    h.push(crop);
    expect(h.canRedo).toBe(false);
    expect(h.ops).toEqual([crop]);
  });

  it("undo/redo on an empty stack return null (no exception)", () => {
    const h = new History();
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
    expect(h.canUndo).toBe(false);
  });

  it("load takes the reference: mutating the history mutates the session array", () => {
    const sessionOps: Op[] = [flip];
    const h = new History();
    h.load(sessionOps);
    h.push(rot);
    expect(sessionOps).toEqual([flip, rot]); // same reference = session saved along
    h.undo();
    expect(sessionOps).toEqual([flip]);
  });

  it("clear zeroes but preserves the shared reference", () => {
    const sessionOps: Op[] = [flip];
    const h = new History();
    h.load(sessionOps);
    h.clear();
    expect(sessionOps).toEqual([]);
    expect(h.ops).toBe(sessionOps);
  });

  it("cascading undo returns in reverse order (LIFO)", () => {
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
