import { describe, expect, test } from "vitest";
import { ProjectStore } from "../../project-store";
import { CommandRejectedError } from "../command-errors";
import type { PianoRollCommand } from "../command-types";
import type { Transaction } from "../transaction";
import {
  getMeasureCount,
} from "../../transport/time-map";
import {
  createTestNote,
  createTestProject,
  TEST_CLIP_ID,
  TEST_INSTRUMENT_ID,
} from "../../../../tests/support/test-builders";

const PPQN = 960;
const MEASURE_TICKS = 3_840;

let transactionSequence = 0;

function dispatch(
  store: ProjectStore,
  command: PianoRollCommand,
): void {
  transactionSequence += 1;
  const transaction: Transaction = {
    transactionId: `time-map-${String(transactionSequence)}`,
    createdAt: transactionSequence,
    commands: [command],
  };

  store.dispatch(transaction);
}

function activeTimeline(store: ProjectStore) {
  const clip = store.getState().clipsById[TEST_CLIP_ID];

  if (clip === undefined) {
    throw new Error("The test clip is missing.");
  }

  return clip.timeline;
}

describe("meter marker commands", () => {
  test("adds, moves, updates and deletes a marker with undo/redo", () => {
    const store = new ProjectStore(createTestProject());

    dispatch(store, {
      type: "AddMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: 2 * MEASURE_TICKS,
      timeSignature: { numerator: 7, denominator: 8, beatGroups: [2, 2, 3] },
    });

    expect(activeTimeline(store).timeMap.meterMarkers).toHaveLength(2);
    // The old end is rounded forward to the next complete 7/8 measure.
    expect(activeTimeline(store).durationTicks)
      .toBe(2 * MEASURE_TICKS + 3 * 3_360);

    // Measure index 3 starts at tick 11_040 on the current map.
    dispatch(store, {
      type: "MoveMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: 2 * MEASURE_TICKS,
      targetTick: 11_040,
    });

    // The requested tick is projected forward onto the preceding 4/4 grid.
    expect(
      activeTimeline(store).timeMap.meterMarkers[1]?.startTick,
    ).toBe(3 * MEASURE_TICKS);

    dispatch(store, {
      type: "UpdateMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: 3 * MEASURE_TICKS,
      timeSignature: { numerator: 3, denominator: 4 },
    });
    expect(
      activeTimeline(store).timeMap.meterMarkers[1]?.timeSignature.numerator,
    ).toBe(3);

    dispatch(store, {
      type: "DeleteMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: 3 * MEASURE_TICKS,
    });

    expect(activeTimeline(store).timeMap.meterMarkers).toHaveLength(1);

    store.undo();
    expect(activeTimeline(store).timeMap.meterMarkers).toHaveLength(2);
    store.redo();
    expect(activeTimeline(store).timeMap.meterMarkers).toHaveLength(1);
  });

  test("rejects invalid placements but accepts an identical meter", () => {
    const store = new ProjectStore(createTestProject());

    expect(() => dispatch(store, {
      type: "AddMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: 1_000,
      timeSignature: { numerator: 3, denominator: 4 },
    })).toThrow(CommandRejectedError);

    dispatch(store, {
      type: "AddMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS,
      timeSignature: { numerator: 4, denominator: 4 },
    });

    expect(activeTimeline(store).timeMap.meterMarkers).toHaveLength(2);

    expect(() => dispatch(store, {
      type: "DeleteMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: 0,
    })).toThrow(CommandRejectedError);
  });

  test("bounds a move between neighbouring markers", () => {
    const store = new ProjectStore(createTestProject());

    dispatch(store, {
      type: "AddMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS,
      timeSignature: { numerator: 3, denominator: 4 },
    });
    // Measures: [0] 4/4, then 3/4 at 3_840, 6_720, 9_600.
    dispatch(store, {
      type: "AddMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: 9_600,
      timeSignature: { numerator: 5, denominator: 4 },
    });

    expect(() => dispatch(store, {
      type: "MoveMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS,
      targetTick: 9_600,
    })).toThrow(CommandRejectedError);
  });
});

describe("tempo marker commands", () => {
  test("keeps consecutive tempo and scale markers with identical values", () => {
    const store = new ProjectStore(createTestProject());
    const initialScale = activeTimeline(store).timeMap.scaleMarkers[0]!;

    dispatch(store, {
      type: "AddTempoMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS,
      bpm: activeTimeline(store).timeMap.tempoMarkers[0]!.bpm,
    });
    dispatch(store, {
      type: "AddScaleMarker",
      clipId: TEST_CLIP_ID,
      marker: {
        ...initialScale,
        startTick: MEASURE_TICKS,
      },
    });

    expect(activeTimeline(store).timeMap.tempoMarkers.map(
      (marker) => marker.startTick,
    )).toEqual([0, MEASURE_TICKS]);
    expect(activeTimeline(store).timeMap.scaleMarkers.map(
      (marker) => marker.startTick,
    )).toEqual([0, MEASURE_TICKS]);
  });

  test("adds, updates and deletes a tempo marker with undo/redo", () => {
    const store = new ProjectStore(createTestProject());

    dispatch(store, {
      type: "AddTempoMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS,
      bpm: 90,
    });

    expect(activeTimeline(store).timeMap.tempoMarkers).toHaveLength(2);

    dispatch(store, {
      type: "UpdateTempoMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS,
      bpm: 75,
    });

    expect(
      activeTimeline(store).timeMap.tempoMarkers[1]?.bpm,
    ).toBe(75);

    dispatch(store, {
      type: "DeleteTempoMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS,
    });

    expect(activeTimeline(store).timeMap.tempoMarkers).toHaveLength(1);

    store.undo();
    expect(activeTimeline(store).timeMap.tempoMarkers).toHaveLength(2);
  });

  test("rejects out-of-range tempos and tick-0 deletion", () => {
    const store = new ProjectStore(createTestProject());

    expect(() => dispatch(store, {
      type: "AddTempoMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS,
      bpm: 500,
    })).toThrow(CommandRejectedError);

    expect(() => dispatch(store, {
      type: "DeleteTempoMarker",
      clipId: TEST_CLIP_ID,
      startTick: 0,
    })).toThrow(CommandRejectedError);
  });
});

describe("section marker commands", () => {
  test("adds, moves, updates and deletes a comment with undo/redo", () => {
    const store = new ProjectStore(createTestProject());

    dispatch(store, {
      type: "AddSectionMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS,
      comment: "Verse",
    });
    dispatch(store, {
      type: "MoveSectionMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS,
      targetTick: MEASURE_TICKS + 240,
    });
    dispatch(store, {
      type: "UpdateSectionMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS + 240,
      comment: "First verse",
    });

    expect(activeTimeline(store).timeMap.sectionMarkers).toEqual([{
      startTick: MEASURE_TICKS + 240,
      comment: "First verse",
    }]);

    dispatch(store, {
      type: "DeleteSectionMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS + 240,
    });
    expect(activeTimeline(store).timeMap.sectionMarkers).toEqual([]);

    store.undo();
    expect(activeTimeline(store).timeMap.sectionMarkers[0]?.comment)
      .toBe("First verse");
    store.redo();
    expect(activeTimeline(store).timeMap.sectionMarkers).toEqual([]);
  });

  test("rejects empty comments and duplicate ticks", () => {
    const store = new ProjectStore(createTestProject());

    expect(() => dispatch(store, {
      type: "AddSectionMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS,
      comment: "   ",
    })).toThrow(CommandRejectedError);

    dispatch(store, {
      type: "AddSectionMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS,
      comment: "Verse",
    });

    expect(() => dispatch(store, {
      type: "AddSectionMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS,
      comment: "Duplicate",
    })).toThrow(CommandRejectedError);
  });
});

describe("measure operations across meter markers", () => {
  test("rejects non-positive or fractional insertion counts", () => {
    for (const count of [0, -1, 1.5, Number.NaN]) {
      const store = new ProjectStore(createTestProject());

      expect(() => dispatch(store, {
        type: "InsertMeasure",
        clipId: TEST_CLIP_ID,
        measureIndex: 0,
        count,
      })).toThrow(CommandRejectedError);
    }
  });

  test("inserts a measure with the meter of the targeted span", () => {
    const store = new ProjectStore(createTestProject());

    dispatch(store, {
      type: "AddMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: 2 * MEASURE_TICKS,
      timeSignature: { numerator: 3, denominator: 4 },
    });
    // The meter edit has rounded the old end forward: 2 × 4/4 followed
    // by 3 × 3/4 = 16_320 ticks.
    dispatch(store, {
      type: "InsertMeasure",
      clipId: TEST_CLIP_ID,
      measureIndex: 2,
      count: 1,
    });

    const timeline = activeTimeline(store);

    // The inserted measure reuses the 3/4 meter (2_880 ticks): the marker
    // at the insertion boundary now starts the inserted measure.
    expect(timeline.durationTicks).toBe(16_320 + 2_880);
    expect(timeline.timeMap.meterMarkers[1]?.startTick)
      .toBe(2 * MEASURE_TICKS);
    expect(
      getMeasureCount(PPQN, timeline.timeMap, timeline.durationTicks),
    ).toBe(6);
  });

  test("inserting before every marker keeps tick 0 immovable", () => {
    const store = new ProjectStore(createTestProject());

    dispatch(store, {
      type: "AddMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: 2 * MEASURE_TICKS,
      timeSignature: { numerator: 3, denominator: 4 },
    });
    dispatch(store, {
      type: "InsertMeasure",
      clipId: TEST_CLIP_ID,
      measureIndex: 0,
      count: 1,
    });

    const timeline = activeTimeline(store);

    expect(timeline.durationTicks).toBe(16_320 + MEASURE_TICKS);
    expect(timeline.timeMap.meterMarkers[0]?.startTick).toBe(0);
    expect(timeline.timeMap.meterMarkers[1]?.startTick)
      .toBe(3 * MEASURE_TICKS);
    expect(
      getMeasureCount(PPQN, timeline.timeMap, timeline.durationTicks),
    ).toBe(6);
  });

  test("removing a measure restores the right-side state at the seam", () => {
    const store = new ProjectStore(createTestProject());

    dispatch(store, {
      type: "AddMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: 2 * MEASURE_TICKS,
      timeSignature: { numerator: 3, denominator: 4 },
    });
    dispatch(store, {
      type: "AddTempoMarker",
      clipId: TEST_CLIP_ID,
      startTick: 2 * MEASURE_TICKS + 1_440,
      bpm: 90,
    });
    dispatch(store, {
      type: "RemoveMeasure",
      clipId: TEST_CLIP_ID,
      measureIndex: 2,
      count: 1,
    });

    const timeline = activeTimeline(store);

    // The marker inside the cut disappears, then the 3/4 state active on the
    // right is restored at the seam together with the tempo state.
    expect(timeline.durationTicks).toBe(16_320 - 2_880);
    expect(timeline.timeMap.meterMarkers).toHaveLength(2);
    expect(timeline.timeMap.meterMarkers[1]?.startTick)
      .toBe(2 * MEASURE_TICKS);
    expect(timeline.timeMap.tempoMarkers).toEqual([
      { startTick: 0, bpm: 120 },
      { startTick: 2 * MEASURE_TICKS, bpm: 90 },
    ]);
    expect(
      getMeasureCount(PPQN, timeline.timeMap, timeline.durationTicks),
    ).toBe(4);
  });

  test("removes several adjacent measures atomically", () => {
    const store = new ProjectStore(createTestProject());

    dispatch(store, {
      type: "RemoveMeasure",
      clipId: TEST_CLIP_ID,
      measureIndex: 1,
      count: 2,
    });

    expect(getMeasureCount(
      PPQN,
      activeTimeline(store).timeMap,
      activeTimeline(store).durationTicks,
    )).toBe(2);

    store.undo();
    expect(getMeasureCount(
      PPQN,
      activeTimeline(store).timeMap,
      activeTimeline(store).durationTicks,
    )).toBe(4);
  });

  test("rejects removal counts that cross the clip boundaries", () => {
    for (const command of [
      { measureIndex: 3, count: 2 },
      { measureIndex: 0, count: 4 },
      { measureIndex: 0, count: 0 },
    ]) {
      const store = new ProjectStore(createTestProject());

      expect(() => dispatch(store, {
        type: "RemoveMeasure",
        clipId: TEST_CLIP_ID,
        ...command,
      })).toThrow(CommandRejectedError);
    }
  });

  test("appending measures uses the last active meter", () => {
    const store = new ProjectStore(createTestProject());

    dispatch(store, {
      type: "AddMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: 2 * MEASURE_TICKS,
      timeSignature: { numerator: 3, denominator: 4 },
    });
    dispatch(store, {
      type: "AppendMeasures",
      clipId: TEST_CLIP_ID,
      count: 2,
    });

    const timeline = activeTimeline(store);

    expect(timeline.durationTicks)
      .toBe(2 * MEASURE_TICKS + 5 * 2_880);
    expect(
      getMeasureCount(PPQN, timeline.timeMap, timeline.durationTicks),
    ).toBe(7);
  });

  test("updating the initial meter advances meters without moving notes", () => {
    const store = new ProjectStore(createTestProject());

    dispatch(store, {
      type: "AddMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: 2 * MEASURE_TICKS,
      timeSignature: { numerator: 3, denominator: 4 },
    });
    dispatch(store, {
      type: "AddTempoMarker",
      clipId: TEST_CLIP_ID,
      startTick: 2 * MEASURE_TICKS,
      bpm: 90,
    });
    dispatch(store, {
      type: "AddScaleMarker",
      clipId: TEST_CLIP_ID,
      marker: {
        startTick: 2 * MEASURE_TICKS,
        rootNote: "D",
        patternType: "scale",
        patternId: "dorian",
      },
    });
    dispatch(store, {
      type: "AddNotes",
      clipId: TEST_CLIP_ID,
      trackInstrumentId: TEST_INSTRUMENT_ID,
      notes: [createTestNote({
        id: "late-note",
        startTick: 12_000,
      })],
    });
    dispatch(store, {
      type: "UpdateTimeSignature",
      clipId: TEST_CLIP_ID,
      timeSignature: { numerator: 6, denominator: 8 },
    });

    const timeline = activeTimeline(store);

    // The old 7_680 marker advances to 8_640, a valid 6/8 boundary. The clip
    // end advances as well; absolute point events and notes do not move.
    expect(timeline.durationTicks).toBe(17_280);
    expect(
      getMeasureCount(PPQN, timeline.timeMap, timeline.durationTicks),
    ).toBe(6);
    expect(timeline.timeMap.meterMarkers[1]?.startTick).toBe(3 * 2_880);
    expect(timeline.timeMap.tempoMarkers).toEqual([
      { startTick: 0, bpm: 120 },
      { startTick: 2 * MEASURE_TICKS, bpm: 90 },
    ]);
    expect(timeline.timeMap.scaleMarkers[1]?.startTick)
      .toBe(2 * MEASURE_TICKS);
    expect(store.getState()
      .clipsById[TEST_CLIP_ID]?.tracksByInstrumentId[TEST_INSTRUMENT_ID]
      ?.notesById["late-note"]?.startTick).toBe(12_000);
  });

  test("rejects a meter edit that would exceed the measure limit", () => {
    const store = new ProjectStore(createTestProject());

    dispatch(store, {
      type: "AppendMeasures",
      clipId: TEST_CLIP_ID,
      count: 240,
    });

    expect(() => dispatch(store, {
      type: "UpdateTimeSignature",
      clipId: TEST_CLIP_ID,
      timeSignature: { numerator: 1, denominator: 32 },
    })).toThrow(CommandRejectedError);
  });
});
