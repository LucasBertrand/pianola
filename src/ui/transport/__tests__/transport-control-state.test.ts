import {
  describe,
  expect,
  test,
} from "vitest";
import {
  isStopAtEndEnabled,
} from "../transport-control-state";

describe("transport control state", () => {
  test("presents stop-at-end as the inverse of auto-advance", () => {
    expect(isStopAtEndEnabled(true)).toBe(false);
    expect(isStopAtEndEnabled(false)).toBe(true);
  });
});
