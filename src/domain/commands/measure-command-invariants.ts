import type { PianoRollCommand } from "./command-types";
import { reject } from "./command-context";

export function assertMeasureIndex(
  measureIndex: number,
  measureCount: number,
  commandType: PianoRollCommand["type"],
): void {
  if (
    !Number.isSafeInteger(measureIndex)
    || measureIndex < 0
    || measureIndex >= measureCount
  ) {
    reject(
      "INVALID_COMMAND",
      `Measure index must be between 0 and ${measureCount - 1}.`,
      commandType,
    );
  }
}
