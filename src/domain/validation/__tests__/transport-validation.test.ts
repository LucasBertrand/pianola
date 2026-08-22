import { describe, expect, test } from "vitest";
import {
  createDefaultProjectClock,
} from "../../transport/transport";
import {
  createDefaultTimeMap,
} from "../../transport/time-map";
import type {
  ClipTimeline,
} from "../../clips/clip";
import {
  validateClipTimeline,
  validateProjectClock,
} from "../transport-validation";

const PPQN = 960;
const CLOCK = createDefaultProjectClock();

function createTimeline(
  timeMap: ClipTimeline["timeMap"],
  durationTicks = 4 * 3_840,
): ClipTimeline {
  return { durationTicks, timeMap };
}

describe("validateClipTimeline", () => {
  test("accepts the default time map", () => {
    expect(validateClipTimeline(createTimeline(createDefaultTimeMap()), CLOCK).valid)
      .toBe(true);
  });

  test("requires meter and tempo markers at tick 0", () => {
    const result = validateClipTimeline(
      createTimeline({
        meterMarkers: [{
          startTick: 3_840,
          timeSignature: { numerator: 4, denominator: 4 },
        }],
        tempoMarkers: [],
        scaleMarkers: createDefaultTimeMap().scaleMarkers,
      }),
      CLOCK,
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "INVALID_TIME_SIGNATURE",
      "INVALID_TEMPO",
    ]);
  });

  test("rejects unordered or duplicate marker ticks", () => {
    const result = validateClipTimeline(
      createTimeline({
        meterMarkers: [
          { startTick: 0, timeSignature: { numerator: 4, denominator: 4 } },
          { startTick: 7_680, timeSignature: { numerator: 3, denominator: 4 } },
          { startTick: 7_680, timeSignature: { numerator: 5, denominator: 4 } },
        ],
        tempoMarkers: [{ startTick: 0, bpm: 120 }],
        scaleMarkers: createDefaultTimeMap().scaleMarkers,
      }),
      CLOCK,
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) =>
      issue.path === "timeMap.meterMarkers[2].startTick"
    )).toBe(true);
  });

  test("rejects a marker off a measure boundary", () => {
    const result = validateClipTimeline(
      createTimeline({
        meterMarkers: [
          { startTick: 0, timeSignature: { numerator: 4, denominator: 4 } },
          { startTick: 4_000, timeSignature: { numerator: 3, denominator: 4 } },
        ],
        tempoMarkers: [{ startTick: 0, bpm: 120 }],
        scaleMarkers: createDefaultTimeMap().scaleMarkers,
      }),
      CLOCK,
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) =>
      issue.message.includes("measure boundary")
    )).toBe(true);
  });

  test("accepts adjacent identical meters at distinct boundaries", () => {
    const result = validateClipTimeline(
      createTimeline({
        meterMarkers: [
          { startTick: 0, timeSignature: { numerator: 4, denominator: 4 } },
          { startTick: 3_840, timeSignature: { numerator: 4, denominator: 4 } },
        ],
        tempoMarkers: [{ startTick: 0, bpm: 120 }],
        scaleMarkers: createDefaultTimeMap().scaleMarkers,
      }),
      CLOCK,
    );

    expect(result).toEqual({ valid: true, issues: [] });
  });

  test("rejects a duration that does not end on a measure boundary", () => {
    const result = validateClipTimeline(
      createTimeline({
        meterMarkers: [
          { startTick: 0, timeSignature: { numerator: 4, denominator: 4 } },
          { startTick: 7_680, timeSignature: { numerator: 3, denominator: 4 } },
        ],
        tempoMarkers: [{ startTick: 0, bpm: 120 }],
        scaleMarkers: createDefaultTimeMap().scaleMarkers,
      }),
      CLOCK,
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) =>
      issue.code === "INVALID_PROJECT_DURATION"
    )).toBe(true);
  });

  test("rejects beat groups that do not sum to the numerator", () => {
    const invalid = validateClipTimeline(
      createTimeline({
        meterMarkers: [{
          startTick: 0,
          timeSignature: {
            numerator: 7,
            denominator: 8,
            beatGroups: [2, 2],
          },
        }],
        tempoMarkers: [{ startTick: 0, bpm: 120 }],
        scaleMarkers: createDefaultTimeMap().scaleMarkers,
      }),
      CLOCK,
    );

    expect(invalid.valid).toBe(false);

    const valid = validateClipTimeline(
      createTimeline(
        {
          meterMarkers: [{
            startTick: 0,
            timeSignature: {
              numerator: 7,
              denominator: 8,
              beatGroups: [2, 2, 3],
            },
          }],
          tempoMarkers: [{ startTick: 0, bpm: 120 }],
          scaleMarkers: createDefaultTimeMap().scaleMarkers,
        },
        4 * 3_360,
      ),
      CLOCK,
    );

    expect(valid.valid).toBe(true);
  });

  test("rejects out-of-range and misplaced tempo markers", () => {
    const result = validateClipTimeline(
      createTimeline({
        meterMarkers: [{
          startTick: 0,
          timeSignature: { numerator: 4, denominator: 4 },
        }],
        tempoMarkers: [
          { startTick: 0, bpm: 120 },
          { startTick: 3_840, bpm: 999 },
        ],
        scaleMarkers: createDefaultTimeMap().scaleMarkers,
      }),
      CLOCK,
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "INVALID_TEMPO"))
      .toBe(true);
  });

  test("requires valid, ordered scale markers starting at tick 0", () => {
    const result = validateClipTimeline(
      createTimeline({
        meterMarkers: [{
          startTick: 0,
          timeSignature: { numerator: 4, denominator: 4 },
        }],
        tempoMarkers: [{ startTick: 0, bpm: 120 }],
        scaleMarkers: [{
          startTick: 0,
          rootNote: "H",
          patternType: "scale",
          patternId: "unknown",
        }],
      }),
      CLOCK,
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "INVALID_SCALE"))
      .toBe(true);
  });
});

describe("validateProjectClock", () => {
  test("validates ppqn and launch grid only", () => {
    expect(validateProjectClock(CLOCK).valid).toBe(true);
    expect(
      validateProjectClock({ ...CLOCK, ppqn: 0 }).valid,
    ).toBe(false);
    expect(
      validateProjectClock({ ...CLOCK, launchGridTicks: -1 }).valid,
    ).toBe(false);
  });
});

describe("defaults", () => {
  test("the default clock uses the project ppqn", () => {
    expect(CLOCK.ppqn).toBe(PPQN);
  });
});
