/**
 * core/history.ts — undo/redo stack over the list of Ops.
 * The ops array is SHARED with the session (load takes the same reference),
 * so saving the session saves the history along with it — a single source of truth.
 * Redo is invalidated by any new operation (standard editor semantics).
 */
import type { Op } from "./pipeline";

export class History {
  ops: Op[] = [];
  private redoStack: Op[] = [];

  /** takes the array's reference — push/pop/mutate on it (session and history are the same array) */
  load(ops: Op[]): void {
    this.ops = ops;
    this.redoStack = [];
  }

  push(op: Op): void {
    this.ops.push(op);
    this.redoStack.length = 0;
  }

  undo(): Op | null {
    const op = this.ops.pop();
    if (!op) return null;
    this.redoStack.push(op);
    return op;
  }

  redo(): Op | null {
    const op = this.redoStack.pop();
    if (!op) return null;
    this.ops.push(op);
    return op;
  }

  get canUndo(): boolean {
    return this.ops.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.ops.length = 0; // keeps the shared reference
    this.redoStack.length = 0;
  }
}
