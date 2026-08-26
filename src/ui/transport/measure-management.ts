export type RelativeMeasurePosition = "before" | "after";

export interface AdjacentMeasureRange {
  readonly measureIndex: number;
  readonly count: number;
}

export function getMaximumAdjacentMeasureCounts(
  measureCount: number,
  currentMeasureIndex: number,
): Readonly<Record<RelativeMeasurePosition, number>> {
  return {
    before: Math.max(0, currentMeasureIndex),
    after: Math.max(0, measureCount - currentMeasureIndex - 1),
  };
}

export function resolveAdjacentMeasureRange(
  measureCount: number,
  currentMeasureIndex: number,
  count: number,
  position: RelativeMeasurePosition,
): AdjacentMeasureRange | null {
  const maximumCounts = getMaximumAdjacentMeasureCounts(
    measureCount,
    currentMeasureIndex,
  );

  if (
    !Number.isSafeInteger(count)
    || count <= 0
    || count > maximumCounts[position]
  ) {
    return null;
  }

  return {
    measureIndex: position === "before"
      ? currentMeasureIndex - count
      : currentMeasureIndex + 1,
    count,
  };
}
