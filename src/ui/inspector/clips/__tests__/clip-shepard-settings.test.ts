import {
  describe,
  expect,
  test,
} from "vitest";
import {
  CLIP_SHEPARD_SETTINGS,
  createClipShepardCssVariables,
} from "../clip-shepard-settings";

describe("clip Shepard settings", () => {
  test("derives equal gaps on both sides of every hatch", () => {
    const variables = createClipShepardCssVariables(
      CLIP_SHEPARD_SETTINGS,
    );

    expect(variables).toEqual({
      "--clip-shepard-angle": "122deg",
      "--clip-shepard-period": "28px",
      "--clip-shepard-hatch-start": "10px",
      "--clip-shepard-hatch-end": "18px",
      "--clip-shepard-hatch-opacity": "14%",
    });
  });

  test("rejects a hatch that cannot fit symmetrically", () => {
    expect(() => createClipShepardCssVariables({
      ...CLIP_SHEPARD_SETTINGS,
      hatchWidthPixels: CLIP_SHEPARD_SETTINGS.periodPixels,
    })).toThrow(RangeError);
  });
});
