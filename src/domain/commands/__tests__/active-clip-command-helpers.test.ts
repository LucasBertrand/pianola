import { describe, expect, test } from "vitest";
import type { TransportState } from "../../transport/transport";
import {
  insertTimeIntoTransport,
  removeTimeFromTransport,
} from "../active-clip-command-helpers";

function createTransport(
  changes: Partial<TransportState> = {},
): TransportState {
  return {
    anchorTick: 8_000,
    loop: { startTick: 2_000, endTick: 8_000 },
    loopEnabled: true,
    ...changes,
  };
}

describe("structural transport edits", () => {
  test("insertion shifts the anchor and loop endpoints on its right", () => {
    const result = insertTimeIntoTransport(
      createTransport(),
      3_840,
      1_920,
    );

    expect(result.anchorTick).toBe(9_920);
    expect(result.loop).toEqual({ startTick: 2_000, endTick: 9_920 });
  });

  test("removal collapses the anchor and both loop endpoints", () => {
    const result = removeTimeFromTransport(
      createTransport(),
      3_840,
      6_720,
      10_000,
    );

    expect(result.anchorTick).toBe(5_120);
    expect(result.loop).toEqual({ startTick: 2_000, endTick: 5_120 });
  });

  test("removal creates a valid fallback when the loop is fully deleted", () => {
    const result = removeTimeFromTransport(
      createTransport({
        loop: { startTick: 4_000, endTick: 6_000 },
      }),
      3_840,
      6_720,
      10_000,
    );

    expect(result.loop).toEqual({ startTick: 3_840, endTick: 5_840 });
  });
});
