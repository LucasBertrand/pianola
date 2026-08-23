import {
  describe,
  expect,
  test,
} from "vitest";
import {
  resolveClipPlayheadVisual,
} from "../clip-playhead-visual";

describe("clip card playhead visual", () => {
  test("keeps a marker on the playhead clip at tick zero", () => {
    expect(resolveClipPlayheadVisual(
      "clip-current",
      3_840,
      { clipId: "clip-current", tick: 0 },
    )).toEqual({ present: true, progress: 0 });
  });

  test("shows elapsed progress only on the playhead clip", () => {
    expect(resolveClipPlayheadVisual(
      "clip-current",
      3_840,
      { clipId: "clip-current", tick: 960 },
    )).toEqual({ present: true, progress: 0.25 });
    expect(resolveClipPlayheadVisual(
      "clip-other",
      3_840,
      { clipId: "clip-current", tick: 960 },
    )).toEqual({ present: false, progress: 0 });
  });
});
