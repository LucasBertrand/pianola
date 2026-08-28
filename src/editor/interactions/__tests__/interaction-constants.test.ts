import {
  describe,
  expect,
  test,
} from "vitest";
import {
  INTERACTION_CONSTANTS,
} from "../interaction-constants";

describe("interaction constants", () => {
  test("keeps loop drawing and note creation long presses aligned", () => {
    expect(INTERACTION_CONSTANTS.loopDrawLongPressDelayMs).toBe(
      INTERACTION_CONSTANTS.longPressDelayMs,
    );
    expect(INTERACTION_CONSTANTS.loopDrawPenLongPressDelayMs).toBe(
      INTERACTION_CONSTANTS.penLongPressDelayMs,
    );
  });
});
