import {
  MAXIMUM_MEASURE_COUNT,
} from "../../domain/clips/clip";
import {
  getMaximumAdjacentMeasureCounts,
} from "../transport/measure-management";

export type MeasureDialogOperation = "insert" | "remove";

export function resolveMeasureDialogMaximumCounts(
  operation: MeasureDialogOperation,
  measureCount: number,
  currentMeasureIndex: number,
): Readonly<Record<"before" | "after", number>> {
  if (operation === "insert") {
    const maximumCount = MAXIMUM_MEASURE_COUNT - measureCount;

    return { before: maximumCount, after: maximumCount };
  }

  return getMaximumAdjacentMeasureCounts(measureCount, currentMeasureIndex);
}
