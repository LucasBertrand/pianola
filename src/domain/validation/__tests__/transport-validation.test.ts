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
        sectionMarkers: [],
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
        sectionMarkers: [],
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
        sectionMarkers: [],
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
        sectionMarkers: [],
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
        sectionMarkers: [],
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
        sectionMarkers: [],
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
          sectionMarkers: [],
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
        sectionMarkers: [],
      }),
      CLOCK,
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "INVALID_TEMPO"))
      .toBe(true);
  });

  test("distinguishes invalid and duplicate positions while accepting the clip end", () => {
    const baseTimeMap = createDefaultTimeMap();
    const fractional = validateClipTimeline(
      createTimeline({
        ...baseTimeMap,
        tempoMarkers: [
          { startTick: 0, bpm: 120 },
          { startTick: 960.5, bpm: 90 },
        ],
      }),
      CLOCK,
    );
    const duplicate = validateClipTimeline(
      createTimeline({
        ...baseTimeMap,
        sectionMarkers: [
          { startTick: 960, comment: "Verse" },
          { startTick: 960, comment: "Chorus" },
        ],
      }),
      CLOCK,
    );
    const atEnd = validateClipTimeline(
      createTimeline({
        ...baseTimeMap,
        sectionMarkers: [{ startTick: 15_360, comment: "End" }],
      }),
      CLOCK,
    );

    expect(fractional.issues).toContainEqual(expect.objectContaining({
      message: "Tempo marker position must be a non-negative whole-number tick.",
    }));
    expect(duplicate.issues).toContainEqual(expect.objectContaining({
      message: "Section markers cannot share a position and must remain strictly ordered.",
    }));
    expect(atEnd).toEqual({ valid: true, issues: [] });
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
        sectionMarkers: [],
      }),
      CLOCK,
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "INVALID_SCALE"))
      .toBe(true);
  });

  test("accepts extended chords and rejects uncurated pitch patterns", () => {
    const createChordTimeline = (patternId: string): ClipTimeline =>
      createTimeline({
        meterMarkers: [{
          startTick: 0,
          timeSignature: { numerator: 4, denominator: 4 },
        }],
        tempoMarkers: [{ startTick: 0, bpm: 120 }],
        scaleMarkers: [{
          startTick: 0,
          rootNote: "C",
          patternType: "chord",
          patternId,
        }],
        sectionMarkers: [],
      });

    expect(validateClipTimeline(createChordTimeline("m13"), CLOCK))
      .toEqual({ valid: true, issues: [] });
    expect(validateClipTimeline(createChordTimeline("7alt"), CLOCK).valid)
      .toBe(false);
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
