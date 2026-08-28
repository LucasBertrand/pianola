import { describe, expect, test } from "vitest";
import {
  getMaximumAdjacentMeasureCounts,
  resolveAdjacentMeasureRange,
} from "../measure-management";

describe("adjacent measure removal", () => {
  test("exposes only the inward direction at clip boundaries", () => {
    expect(getMaximumAdjacentMeasureCounts(4, 0)).toEqual({
      before: 0,
      after: 3,
    });
    expect(getMaximumAdjacentMeasureCounts(4, 3)).toEqual({
      before: 3,
      after: 0,
    });
  });

  test("resolves ranges on either side without including the current measure", () => {
    expect(resolveAdjacentMeasureRange(6, 3, 2, "before")).toEqual({
      measureIndex: 1,
      count: 2,
    });
    expect(resolveAdjacentMeasureRange(6, 3, 2, "after")).toEqual({
      measureIndex: 4,
      count: 2,
    });
  });

  test("rejects ranges that cross a boundary", () => {
    expect(resolveAdjacentMeasureRange(4, 0, 1, "before")).toBeNull();
    expect(resolveAdjacentMeasureRange(4, 3, 1, "after")).toBeNull();
    expect(resolveAdjacentMeasureRange(4, 1, 2, "before")).toBeNull();
  });
});
