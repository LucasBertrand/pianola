export type PatchOperation = "add" | "remove" | "replace";
export type PatchPathSegment = string | number;

export interface StatePatch<TValue = unknown> {
  readonly operation: PatchOperation;
  readonly path: readonly PatchPathSegment[];
  readonly value?: TValue;
}

export interface PatchTransaction<TValue = unknown> {
  readonly transactionId: string;
  readonly label?: string;
  readonly createdAt: number;
  readonly forwardPatches: readonly StatePatch<TValue>[];
  readonly inversePatches: readonly StatePatch<TValue>[];
}

export interface HistoryState<T> {
  readonly past: readonly PatchTransaction[];
  readonly present: T;
  readonly future: readonly PatchTransaction[];
}

export type PatchApplier<T> = (
  state: T,
  patches: readonly StatePatch[],
) => T;

export function createHistoryState<T>(present: T): HistoryState<T> {
  return {
    past: [],
    present,
    future: [],
  };
}

export function recordHistoryEntry<T>(
  history: HistoryState<T>,
  present: T,
  patchTransaction: PatchTransaction,
): HistoryState<T> {
  return {
    past: [...history.past, patchTransaction],
    present,
    future: [],
  };
}

export function undoHistory<T>(
  history: HistoryState<T>,
  applyPatches: PatchApplier<T>,
): HistoryState<T> {
  const patchTransaction = history.past.at(-1);

  if (patchTransaction === undefined) {
    return history;
  }

  return {
    past: history.past.slice(0, -1),
    present: applyPatches(
      history.present,
      patchTransaction.inversePatches,
    ),
    future: [patchTransaction, ...history.future],
  };
}

export function redoHistory<T>(
  history: HistoryState<T>,
  applyPatches: PatchApplier<T>,
): HistoryState<T> {
  const patchTransaction = history.future[0];

  if (patchTransaction === undefined) {
    return history;
  }

  return {
    past: [...history.past, patchTransaction],
    present: applyPatches(
      history.present,
      patchTransaction.forwardPatches,
    ),
    future: history.future.slice(1),
  };
}

export function canUndo<T>(history: HistoryState<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: HistoryState<T>): boolean {
  return history.future.length > 0;
}
