import { describe, expect, test } from "vitest";

import {
  createDefaultClipTimeline,
} from "../clip";
import { createDefaultProjectClock } from "../../transport/transport";

describe("createDefaultClipTimeline", () => {
  test("uses the requested initial meter and measure count", () => {
    const clock = createDefaultProjectClock();
    const timeline = createDefaultClipTimeline(
      clock,
      7,
      { numerator: 6, denominator: 8 },
    );

    expect(timeline.timeMap.meterMarkers).toEqual([{
      startTick: 0,
      timeSignature: { numerator: 6, denominator: 8 },
    }]);
    expect(timeline.durationTicks).toBe(7 * 2_880);
  });
});
