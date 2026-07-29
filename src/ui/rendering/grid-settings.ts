export type GridSubdivision = "straight" | "triplet" | "dotted";

export interface GridSettings {
  readonly baseResolutionTicks: number;
  readonly subdivision: GridSubdivision;
  readonly resolutionTicks: number;
}

export const DEFAULT_GRID_SETTINGS: GridSettings = Object.freeze({
  baseResolutionTicks: 240,
  subdivision: "straight",
  resolutionTicks: 240,
});

export function createGridSettings(
  baseResolutionTicks: number,
  subdivision: GridSubdivision,
): GridSettings {
  if (
    !Number.isSafeInteger(baseResolutionTicks)
    || baseResolutionTicks <= 0
  ) {
    throw new RangeError(
      "Grid base resolution must be a positive safe integer.",
    );
  }

  const resolutionTicks = calculateGridResolutionTicks(
    baseResolutionTicks,
    subdivision,
  );

  if (!Number.isSafeInteger(resolutionTicks) || resolutionTicks <= 0) {
    throw new RangeError(
      "Grid resolution must be a positive safe integer.",
    );
  }

  return Object.freeze({
    baseResolutionTicks,
    subdivision,
    resolutionTicks,
  });
}

export function calculateGridResolutionTicks(
  baseResolutionTicks: number,
  subdivision: GridSubdivision,
): number {
  switch (subdivision) {
    case "triplet":
      return Math.round(baseResolutionTicks * 2 / 3);
    case "dotted":
      return Math.round(baseResolutionTicks * 3 / 2);
    case "straight":
      return baseResolutionTicks;
  }
}

export function parseGridSubdivision(
  value: string,
): GridSubdivision | null {
  switch (value) {
    case "straight":
    case "triplet":
    case "dotted":
      return value;
    default:
      return null;
  }
}
