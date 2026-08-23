import {
  describe,
  expect,
  test,
} from "vitest";
import {
  createDefaultTransportState,
  resolvePlaybackStartTick,
} from "../../domain/transport/transport";

describe("playback start position", () => {
  test("restarts at zero when Play is pressed at the clip end", () => {
    expect(resolvePlaybackStartTick(
      3_840,
      3_840,
      createDefaultTransportState(),
    )).toBe(0);
  });

  test("restarts at the loop start when looping is enabled", () => {
    expect(resolvePlaybackStartTick(
      3_840,
      3_840,
      {
        ...createDefaultTransportState(),
        loopEnabled: true,
        loop: { startTick: 960, endTick: 2_880 },
      },
    )).toBe(960);
  });
});
