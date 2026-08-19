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
    // The measure count is preserved: 2 × 4/4 then 2 × 7/8.
    expect(activeTimeline(store).durationTicks)
      .toBe(2 * MEASURE_TICKS + 2 * 3_360);

    // Measure index 3 starts at tick 11_040 on the current map.
    dispatch(store, {
      type: "MoveMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: 2 * MEASURE_TICKS,
      targetTick: 11_040,
    });

    // Anchored to measure index 3, its tick is recomputed on the 4/4 grid.
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

  test("rejects invalid marker placements", () => {
    const store = new ProjectStore(createTestProject());

    expect(() => dispatch(store, {
      type: "AddMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: 1_000,
      timeSignature: { numerator: 3, denominator: 4 },
    })).toThrow(CommandRejectedError);

    expect(() => dispatch(store, {
      type: "AddMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS,
      timeSignature: { numerator: 4, denominator: 4 },
    })).toThrow(CommandRejectedError);

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

describe("measure operations across meter markers", () => {
  test("inserts a measure with the meter of the targeted span", () => {
    const store = new ProjectStore(createTestProject());

    dispatch(store, {
      type: "AddMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: 2 * MEASURE_TICKS,
      timeSignature: { numerator: 3, denominator: 4 },
    });
    // 2 × 4/4 + 2 × 3/4 = 13_440 ticks.
    dispatch(store, {
      type: "InsertMeasure",
      clipId: TEST_CLIP_ID,
      measureIndex: 2,
      count: 1,
    });

    const timeline = activeTimeline(store);

    // The inserted measure reuses the 3/4 meter (2_880 ticks): the marker
    // at the insertion boundary now starts the inserted measure.
    expect(timeline.durationTicks).toBe(13_440 + 2_880);
    expect(timeline.timeMap.meterMarkers[1]?.startTick)
      .toBe(2 * MEASURE_TICKS);
    expect(
      getMeasureCount(PPQN, timeline.timeMap, timeline.durationTicks),
    ).toBe(5);
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

    expect(timeline.durationTicks).toBe(13_440 + MEASURE_TICKS);
    expect(timeline.timeMap.meterMarkers[0]?.startTick).toBe(0);
    expect(timeline.timeMap.meterMarkers[1]?.startTick)
      .toBe(3 * MEASURE_TICKS);
    expect(
      getMeasureCount(PPQN, timeline.timeMap, timeline.durationTicks),
    ).toBe(5);
  });

  test("removing a measure drops its inner markers and shifts the rest", () => {
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
    });

    const timeline = activeTimeline(store);

    // The 3/4 marker was placed on the removed measure, so it is entirely dropped.
    // The remaining measures revert to the previous active meter (4/4).
    expect(timeline.durationTicks).toBe(3 * MEASURE_TICKS);
    expect(timeline.timeMap.meterMarkers).toHaveLength(1);
    expect(timeline.timeMap.tempoMarkers).toHaveLength(1);
    expect(
      getMeasureCount(PPQN, timeline.timeMap, timeline.durationTicks),
    ).toBe(3);
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
      .toBe(2 * MEASURE_TICKS + 4 * 2_880);
    expect(
      getMeasureCount(PPQN, timeline.timeMap, timeline.durationTicks),
    ).toBe(6);
  });

  test("updating the initial meter preserves measure count and trims notes", () => {
    const store = new ProjectStore(createTestProject());

    dispatch(store, {
      type: "AddMeterMarker",
      clipId: TEST_CLIP_ID,
      startTick: 2 * MEASURE_TICKS,
      timeSignature: { numerator: 3, denominator: 4 },
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

    // 4 measures: 2 × 6/8 (2_880) then 2 × 3/4 (2_880).
    expect(timeline.durationTicks).toBe(4 * 2_880);
    expect(
      getMeasureCount(PPQN, timeline.timeMap, timeline.durationTicks),
    ).toBe(4);
    expect(timeline.timeMap.meterMarkers[1]?.startTick).toBe(2 * 2_880);
    // The note past the new duration was trimmed.
    expect(store.getState()
      .clipsById[TEST_CLIP_ID]?.tracksByInstrumentId[TEST_INSTRUMENT_ID]
      ?.notesById["late-note"]).toBeUndefined();
  });
});
