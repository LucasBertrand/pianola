import { describe, expect, test } from "vitest";
import {
  areTimeSignaturesEqual,
  createDefaultTimeMap,
  createDefaultTimeSignature,
  getBeatGroups,
  getDurationForMeasureCount,
  getMeasureBeatBoundaryTicks,
  getMeasureCount,
  getMeasureCountCoveringTick,
  getMeasurePosition,
  getMeasureSpanAtTick,
  getMeasureSpans,
  getMeasureSubdivisionTicks,
  getMeterAtTick,
  getTempoAtTick,
  getTicksPerMeasure,
  insertMeterMarker,
  insertTempoMarker,
  insertTimeIntoTimeMap,
  isMeasureBoundary,
  moveMeterMarker,
  moveTempoMarker,
  normalizeMeterMarkers,
  normalizeTempoMarkers,
  removeMeterMarker,
  removeTempoMarker,
  removeTimeFromTimeMap,
  replaceInitialMeter,
  snapTickToMeasureCellStart,
  snapTickToMeasureGrid,
  tickToSeconds,
  updateMeterMarker,
  updateTempoMarker,
  type TimeMap,
} from "../time-map";

const PPQN = 960;

function createMixedTimeMap(): TimeMap {
  // 2 × 4/4 (3_840), then 2 × 7/8 (3_360), then 1 × 3/4 (2_880).
  return {
    meterMarkers: [
      { startTick: 0, timeSignature: { numerator: 4, denominator: 4 } },
      {
        startTick: 7_680,
        timeSignature: {
          numerator: 7,
          denominator: 8,
          beatGroups: [2, 2, 3],
        },
      },
      { startTick: 14_400, timeSignature: { numerator: 3, denominator: 4 } },
    ],
    tempoMarkers: [
      { startTick: 0, bpm: 120 },
      { startTick: 7_680, bpm: 60 },
    ],
scaleMarkers: [],
  };
}

const MIXED_DURATION = 7_680 + 2 * 3_360 + 2_880;

describe("time-map navigation", () => {
  test("derives measure spans across meter changes", () => {
    const spans = getMeasureSpans(
      PPQN,
      createMixedTimeMap(),
      MIXED_DURATION,
    );

    expect(spans.map((span) => [span.startTick, span.endTick])).toEqual([
      [0, 3_840],
      [3_840, 7_680],
      [7_680, 11_040],
      [11_040, 14_400],
      [14_400, 17_280],
    ]);
    expect(spans.map((span) => span.timeSignature.numerator)).toEqual([
      4, 4, 7, 7, 3,
    ]);
    expect(getMeasureCount(PPQN, createMixedTimeMap(), MIXED_DURATION))
      .toBe(5);
  });

  test("locates the active meter and tempo at any tick", () => {
    const timeMap = createMixedTimeMap();

    expect(getMeterAtTick(timeMap, 0).numerator).toBe(4);
    expect(getMeterAtTick(timeMap, 8_000).numerator).toBe(7);
    expect(getMeterAtTick(timeMap, 17_000).numerator).toBe(3);
    expect(getTempoAtTick(timeMap, 0)).toBe(120);
    expect(getTempoAtTick(timeMap, 7_680)).toBe(60);
    expect(getTempoAtTick(timeMap, 17_000)).toBe(60);
  });

  test("converts ticks to measure positions with beat groups", () => {
    const position = getMeasurePosition(
      PPQN,
      createMixedTimeMap(),
      MIXED_DURATION,
      7_680 + 960 + 960 + 960,
    );

    expect(position).toEqual({
      measureIndex: 2,
      beatIndex: 2,
      tickInBeat: 960,
    });
  });

  test("detects measure boundaries only at span starts", () => {
    const timeMap = createMixedTimeMap();

    expect(isMeasureBoundary(PPQN, timeMap, MIXED_DURATION, 7_680)).toBe(true);
    expect(isMeasureBoundary(PPQN, timeMap, MIXED_DURATION, 11_040)).toBe(true);
    expect(isMeasureBoundary(PPQN, timeMap, MIXED_DURATION, 8_000)).toBe(false);
    expect(isMeasureBoundary(PPQN, timeMap, MIXED_DURATION, 0)).toBe(false);
    expect(isMeasureBoundary(PPQN, timeMap, MIXED_DURATION, MIXED_DURATION))
      .toBe(false);
  });

  test("exposes beat boundary ticks following the beat grouping", () => {
    const timeMap = createMixedTimeMap();
    const span = getMeasureSpanAtTick(PPQN, timeMap, MIXED_DURATION, 8_000);

    expect(getMeasureBeatBoundaryTicks(PPQN, span)).toEqual([
      7_680,
      7_680 + 960,
      7_680 + 1_920,
    ]);
  });

  test("computes cumulative seconds across tempo markers", () => {
    const timeMap = createMixedTimeMap();

    expect(tickToSeconds(PPQN, timeMap, 0)).toBe(0);
    expect(tickToSeconds(PPQN, timeMap, 1_920)).toBe(1);
    expect(tickToSeconds(PPQN, timeMap, 7_680)).toBe(4);
    // 120 BPM until 7_680 (4 s), then 60 BPM for 1_920 ticks (2 s).
    expect(tickToSeconds(PPQN, timeMap, 9_600)).toBe(6);
  });
});

describe("beat groups", () => {
  test("groups compound meters by three denominator units", () => {
    expect(getBeatGroups({ numerator: 6, denominator: 8 })).toEqual([3, 3]);
    expect(getBeatGroups({ numerator: 12, denominator: 8 }))
      .toEqual([3, 3, 3, 3]);
    expect(getBeatGroups({ numerator: 3, denominator: 8 })).toEqual([3]);
  });

  test("defaults simple meters to one unit per beat", () => {
    expect(getBeatGroups({ numerator: 4, denominator: 4 }))
      .toEqual([1, 1, 1, 1]);
    expect(getBeatGroups({ numerator: 7, denominator: 8 }))
      .toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  test("respects explicit beat groups in equality", () => {
    expect(areTimeSignaturesEqual(
      { numerator: 6, denominator: 8 },
      { numerator: 6, denominator: 8, beatGroups: [3, 3] },
    )).toBe(true);
    expect(areTimeSignaturesEqual(
      { numerator: 6, denominator: 8 },
      { numerator: 6, denominator: 8, beatGroups: [2, 2, 2] },
    )).toBe(false);
  });
});

describe("meter marker operations", () => {
  test("inserts a marker on a measure boundary", () => {
    const edit = insertMeterMarker(
      PPQN,
      createDefaultTimeMap(),
      4 * 3_840,
      { startTick: 7_680, timeSignature: { numerator: 3, denominator: 4 } },
    );

    expect(edit.timeMap.meterMarkers).toHaveLength(2);
    expect(edit.timeMap.meterMarkers[1]?.startTick).toBe(7_680);
    // The measure count is preserved: 2 × 4/4 then 2 × 3/4.
    expect(edit.durationTicks).toBe(7_680 + 2 * 2_880);
  });

  test("rejects insertion off a boundary, at tick 0, or identical to the active meter", () => {
    expect(() => insertMeterMarker(
      PPQN,
      createDefaultTimeMap(),
      4 * 3_840,
      { startTick: 4_000, timeSignature: { numerator: 3, denominator: 4 } },
    )).toThrow(RangeError);
    expect(() => insertMeterMarker(
      PPQN,
      createDefaultTimeMap(),
      4 * 3_840,
      { startTick: 0, timeSignature: { numerator: 3, denominator: 4 } },
    )).toThrow(RangeError);
    expect(() => insertMeterMarker(
      PPQN,
      createDefaultTimeMap(),
      4 * 3_840,
      { startTick: 3_840, timeSignature: { numerator: 4, denominator: 4 } },
    )).toThrow(RangeError);
  });

  test("moves a marker between its neighbours in measure order", () => {
    const edit = moveMeterMarker(
      PPQN,
      createMixedTimeMap(),
      MIXED_DURATION,
      14_400,
      11_040,
    );

    // The 3/4 marker moves to measure index 3; ticks are recomputed.
    expect(edit.timeMap.meterMarkers.map((marker) => marker.startTick))
      .toEqual([0, 7_680, 11_040]);
    expect(edit.durationTicks).toBe(11_040 + 2_880 + 2_880);
    expect(() => moveMeterMarker(
      PPQN,
      createMixedTimeMap(),
      MIXED_DURATION,
      0,
      3_840,
    )).toThrow(RangeError);
  });

  test("merges adjacent identical meters on update", () => {
    const edit = updateMeterMarker(
      PPQN,
      createMixedTimeMap(),
      MIXED_DURATION,
      14_400,
      {
        numerator: 7,
        denominator: 8,
        beatGroups: [2, 2, 3],
      },
    );

    expect(edit.timeMap.meterMarkers.map((marker) => marker.startTick))
      .toEqual([0, 7_680]);
    expect(edit.durationTicks).toBe(7_680 + 3 * 3_360);
  });

  test("removes a marker and recomputes following ticks", () => {
    const edit = removeMeterMarker(
      PPQN,
      createMixedTimeMap(),
      MIXED_DURATION,
      7_680,
    );

    // The 3/4 marker keeps its measure index 4 and moves to tick 15_360.
    expect(edit.timeMap.meterMarkers.map((marker) => marker.startTick))
      .toEqual([0, 15_360]);
    expect(edit.durationTicks).toBe(15_360 + 2_880);
    expect(() => removeMeterMarker(
      PPQN,
      createMixedTimeMap(),
      MIXED_DURATION,
      0,
    )).toThrow(RangeError);
  });

  test("normalization sorts, dedupes and merges", () => {
    const normalized = normalizeMeterMarkers([
      { startTick: 3_840, timeSignature: { numerator: 3, denominator: 4 } },
      { startTick: 0, timeSignature: { numerator: 4, denominator: 4 } },
      { startTick: 3_840, timeSignature: { numerator: 5, denominator: 4 } },
      { startTick: 7_680, timeSignature: { numerator: 3, denominator: 4 } },
    ]);

    expect(normalized.map((marker) => marker.startTick)).toEqual([0, 3_840]);
  });
});

describe("tempo marker operations", () => {
  test("inserts a tempo marker at any tick", () => {
    const timeMap = insertTempoMarker(
      createDefaultTimeMap(),
      4 * 3_840,
      { startTick: 4_000, bpm: 90 },
    );

    expect(timeMap.tempoMarkers).toHaveLength(2);
    expect(getTempoAtTick(timeMap, 4_000)).toBe(90);
  });

  test("moves, updates and removes tempo markers within bounds", () => {
    const withMarker = insertTempoMarker(
      createDefaultTimeMap(),
      4 * 3_840,
      { startTick: 3_840, bpm: 90 },
    );
    const moved = moveTempoMarker(withMarker, 3_840, 7_680);

    expect(moved.tempoMarkers[1]?.startTick).toBe(7_680);
    expect(() => moveTempoMarker(withMarker, 0, 7_680))
      .toThrow(RangeError);

    const updated = updateTempoMarker(withMarker, 3_840, 100);

    expect(getTempoAtTick(updated, 3_840)).toBe(100);
    expect(() => updateTempoMarker(withMarker, 3_840, 0)).toThrow(RangeError);

    const removed = removeTempoMarker(withMarker, 3_840);

    expect(removed.tempoMarkers).toHaveLength(1);
    expect(() => removeTempoMarker(withMarker, 0)).toThrow(RangeError);
  });

  test("normalization merges adjacent identical tempos", () => {
    const normalized = normalizeTempoMarkers([
      { startTick: 3_840, bpm: 120 },
      { startTick: 0, bpm: 120 },
      { startTick: 7_680, bpm: 60 },
    ]);

    expect(normalized.map((marker) => marker.startTick)).toEqual([0, 7_680]);
  });
});

describe("structural time edits", () => {
  test("inserting time shifts later markers but not tick 0", () => {
    const shifted = insertTimeIntoTimeMap(
      createMixedTimeMap(),
      3_840,
      3_840,
    );

    expect(shifted.meterMarkers.map((marker) => marker.startTick)).toEqual([
      0, 11_520, 18_240,
    ]);
    expect(shifted.tempoMarkers.map((marker) => marker.startTick)).toEqual([
      0, 11_520,
    ]);

    const shiftedAtZero = insertTimeIntoTimeMap(
      createMixedTimeMap(),
      0,
      3_840,
    );

    expect(shiftedAtZero.meterMarkers.map((marker) => marker.startTick))
      .toEqual([0, 11_520, 18_240]);
  });

  test("removing a measure drops its meter marker even if the segment continued", () => {
    // Remove the first 7/8 measure [7_680, 11_040).
    const edit = removeTimeFromTimeMap(
      PPQN,
      createMixedTimeMap(),
      MIXED_DURATION,
      7_680,
      11_040,
    );

    expect(edit.timeMap.meterMarkers.map((marker) => marker.startTick))
      .toEqual([0, 11_520]);
    expect(edit.timeMap.meterMarkers[1]?.timeSignature.numerator).toBe(3);
    expect(edit.durationTicks).toBe(14_400);
    expect(getMeasureCount(PPQN, edit.timeMap, edit.durationTicks)).toBe(4);
  });

  test("removing the only measure of a segment drops its marker", () => {
    // Remove both 7/8 measures [7_680, 14_400).
    const edit = removeTimeFromTimeMap(
      PPQN,
      createMixedTimeMap(),
      MIXED_DURATION,
      7_680,
      14_400,
    );

    expect(edit.timeMap.meterMarkers.map((marker) => marker.startTick))
      .toEqual([0, 7_680]);
    expect(edit.timeMap.meterMarkers[1]?.timeSignature.numerator).toBe(3);
    expect(edit.durationTicks).toBe(7_680 + 2_880);
  });

  test("replaceInitialMeter preserves measure indices and count", () => {
    const { timeMap, durationTicks } = replaceInitialMeter(
      PPQN,
      createMixedTimeMap(),
      MIXED_DURATION,
      { numerator: 6, denominator: 8 },
    );

    // 6/8 measures are 2_880 ticks: 2 × 2_880 = 5_760 before the 7/8 marker.
    expect(timeMap.meterMarkers[0]?.timeSignature.numerator).toBe(6);
    expect(timeMap.meterMarkers[1]?.startTick).toBe(5_760);
    expect(timeMap.meterMarkers[2]?.startTick).toBe(5_760 + 2 * 3_360);
    expect(durationTicks).toBe(5_760 + 2 * 3_360 + 2_880);
    expect(getMeasureCount(PPQN, timeMap, durationTicks)).toBe(5);
  });

  test("counting helpers cover partial measures", () => {
    const markers = createDefaultTimeMap().meterMarkers;

    expect(getMeasureCountCoveringTick(PPQN, markers, 0)).toBe(1);
    expect(getMeasureCountCoveringTick(PPQN, markers, 3_840)).toBe(1);
    expect(getMeasureCountCoveringTick(PPQN, markers, 3_841)).toBe(2);
    expect(getDurationForMeasureCount(PPQN, markers, 3)).toBe(11_520);
  });
});

describe("defaults", () => {
  test("creates a single-marker default time map", () => {
    const timeMap = createDefaultTimeMap();

    expect(timeMap.meterMarkers).toEqual([{
      startTick: 0,
      timeSignature: createDefaultTimeSignature(),
    }]);
    expect(timeMap.tempoMarkers).toEqual([{ startTick: 0, bpm: 120 }]);
    expect(getTicksPerMeasure(PPQN, createDefaultTimeSignature()))
      .toBe(3_840);
  });
});

describe("measure subdivisions", () => {
  test("steps uniformly from the measure downbeat to the measure end", () => {
    const span = {
      index: 0,
      startTick: 0,
      endTick: 3_840,
      timeSignature: { numerator: 4, denominator: 4 as const },
    };

    // 1/8 triplet resolution (320 ticks): 12 equal steps in a 4/4 measure.
    expect(getMeasureSubdivisionTicks(span, 320)).toEqual([
      320, 640, 960,
      1_280, 1_600, 1_920,
      2_240, 2_560, 2_880,
      3_200, 3_520,
    ]);
  });

  test("includes all resolution steps from measure start regardless of beat grouping", () => {
    const span = {
      index: 0,
      startTick: 0,
      endTick: 2_880,
      timeSignature: { numerator: 6, denominator: 8 as const },
    };

    // 6/8: 1/8 straight (480) steps from the downbeat through the measure.
    expect(getMeasureSubdivisionTicks(span, 480)).toEqual([
      480, 960, 1_440, 1_920, 2_400,
    ]);
    // 1/4 straight (960): two steps fit within the 2_880-tick measure.
    expect(getMeasureSubdivisionTicks(span, 960)).toEqual([960, 1_920]);
  });

  test("produces all resolution steps within a grouped-beat measure", () => {
    const span = {
      index: 0,
      startTick: 0,
      endTick: 3_360,
      timeSignature: {
        numerator: 7,
        denominator: 8 as const,
        beatGroups: [2, 2, 3],
      },
    };

    // 7/8 [2,2,3] measure (3_360 ticks); 1/8 straight (480) gives 6 steps.
    expect(getMeasureSubdivisionTicks(span, 480)).toEqual([
      480, 960, 1_440, 1_920, 2_400, 2_880,
    ]);
  });

  test("returns no line when the resolution equals or exceeds the measure duration", () => {
    const span = {
      index: 0,
      startTick: 0,
      endTick: 3_840,
      timeSignature: { numerator: 4, denominator: 4 as const },
    };

    expect(getMeasureSubdivisionTicks(span, 3_840)).toEqual([]);
    expect(getMeasureSubdivisionTicks(span, 0)).toEqual([]);
  });

  test("clips overflowing resolutions at the measure boundary", () => {
    // 4/4 with dotted-1/4 resolution (1_440): two steps fit, third would overflow.
    const span = {
      index: 0,
      startTick: 0,
      endTick: 3_840,
      timeSignature: { numerator: 4, denominator: 4 as const },
    };

    expect(getMeasureSubdivisionTicks(span, 1_440)).toEqual([1_440, 2_880]);
  });
});

describe("measure-grid snap", () => {
  // 4/4 at PPQN=960: measure=3_840, dotted-1/4 resolution=1_440.
  // Valid grid positions: 0, 1_440, 2_880, 3_840 (measure boundary).
  const ts44 = { numerator: 4, denominator: 4 as const };
  const timeMap44 = {
    meterMarkers: [{ startTick: 0, timeSignature: ts44 }],
    tempoMarkers: [{ startTick: 0, bpm: 120 }],
scaleMarkers: [],
  };
  const duration = 3_840;
  const res = 1_440;

  test("snapTickToMeasureGrid snaps to the nearest grid point", () => {
    // Below midpoint between 0 and 1_440 → snaps down.
    expect(snapTickToMeasureGrid(PPQN, timeMap44, duration, 719, res)).toBe(0);
    // At the midpoint tie-breaks to the lower anchor.
    expect(snapTickToMeasureGrid(PPQN, timeMap44, duration, 720, res)).toBe(0);
    // Above midpoint → snaps up.
    expect(snapTickToMeasureGrid(PPQN, timeMap44, duration, 721, res)).toBe(1_440);
    expect(snapTickToMeasureGrid(PPQN, timeMap44, duration, 3_200, res)).toBe(2_880);
    // Near the measure boundary → snaps to boundary, not past it.
    expect(snapTickToMeasureGrid(PPQN, timeMap44, duration, 3_500, res)).toBe(3_840);
    expect(snapTickToMeasureGrid(PPQN, timeMap44, duration, 3_840, res)).toBe(3_840);
  });

  test("snapTickToMeasureGrid never produces a position past the measure end", () => {
    // 4_320 (= 2_880 + 1_440) is past the measure; must clamp to 3_840.
    expect(snapTickToMeasureGrid(PPQN, timeMap44, duration, 4_000, res)).toBe(3_840);
  });

  test("snapTickToMeasureCellStart floors to the cell start within the measure", () => {
    expect(snapTickToMeasureCellStart(PPQN, timeMap44, duration, 0, res)).toBe(0);
    expect(snapTickToMeasureCellStart(PPQN, timeMap44, duration, 719, res)).toBe(0);
    expect(snapTickToMeasureCellStart(PPQN, timeMap44, duration, 1_440, res)).toBe(1_440);
    expect(snapTickToMeasureCellStart(PPQN, timeMap44, duration, 3_839, res)).toBe(2_880);
  });
});
