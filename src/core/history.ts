/**
 * core/history.ts — M5: pilha de desfazer/refazer sobre a lista de Ops.
 * O array de ops é COMPARTILHADO com a sessão (load recebe a mesma referência),
 * então salvar a sessão salva o histórico junto — uma fonte de verdade só.
 * Refazer é invalidado por qualquer operação nova (semântica padrão de editor).
 */
import type { Op } from "./pipeline";

export class History {
  ops: Op[] = [];
  private redoStack: Op[] = [];

  /** assume a referência do array — push/pop/muta nele (sessão e histórico são o mesmo array) */
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
    this.ops.length = 0; // mantém a referência compartilhada
    this.redoStack.length = 0;
  }
}
