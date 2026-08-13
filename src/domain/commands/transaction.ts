import { CommandRejectedError } from "./command-errors";
import type { PianoRollCommand } from "./command-types";

export interface Transaction {
  readonly transactionId: string;
  readonly label?: string;
  readonly createdAt: number;
  readonly commands: readonly PianoRollCommand[];
}

export function assertValidTransaction(transaction: Transaction): void {
  if (
    transaction.transactionId.trim().length === 0
    || !Number.isFinite(transaction.createdAt)
  ) {
    throw new CommandRejectedError(
      "INVALID_TRANSACTION",
      "Transaction ID must not be empty and creation time must be finite.",
      null,
    );
  }
}

