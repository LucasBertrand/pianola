import { describe, expect, test } from "vitest";
import {
  MAXIMUM_MEASURE_COUNT,
} from "../../../domain/clips/clip";
import {
  resolveMeasureDialogMaximumCounts,
} from "../piano-roll-dialog-model";

describe("piano-roll measure dialog model", () => {
  test("offers the remaining project capacity for insertion on either side", () => {
    expect(resolveMeasureDialogMaximumCounts("insert", 12, 5)).toEqual({
      before: MAXIMUM_MEASURE_COUNT - 12,
      after: MAXIMUM_MEASURE_COUNT - 12,
    });
  });

  test("offers only adjacent existing measures for removal", () => {
    expect(resolveMeasureDialogMaximumCounts("remove", 6, 2)).toEqual({
      before: 2,
      after: 3,
    });
  });
});
