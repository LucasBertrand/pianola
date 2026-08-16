import { describe, expect, test } from "vitest";
import {
  createTimeMapMarkerFlags,
  createMarkerDraft,
  formatMarkerFlagLabel,
  normalizeDraftBpm,
  normalizeDraftTimeSignature,
  planMarkerDeletionCommands,
  planMarkerDraftCommands,
  planMarkerMoveCommands,
} from "../time-map-marker-plans";
import {
  createTestProject,
  TEST_CLIP_ID,
} from "../../../../../tests/support/test-builders";
import type {
  TimeMap,
} from "../../../../domain/transport/time-map";

const MEASURE_TICKS = 3_840;

function createProjectWithMarkers(): ReturnType<typeof createTestProject> {
  const state = createTestProject();
  const clip = state.clipsById[TEST_CLIP_ID];

  if (clip === undefined) {
    throw new Error("The test clip is missing.");
  }

  const timeMap: TimeMap = {
    meterMarkers: [
      { startTick: 0, timeSignature: { numerator: 4, denominator: 4 } },
      {
        startTick: 2 * MEASURE_TICKS,
        timeSignature: { numerator: 7, denominator: 8, beatGroups: [2, 2, 3] },
      },
    ],
    tempoMarkers: [
      { startTick: 0, bpm: 120 },
      { startTick: 2 * MEASURE_TICKS, bpm: 90 },
    ],
scaleMarkers: [],
  };

  return {
    ...state,
    clipsById: {
      ...state.clipsById,
      [TEST_CLIP_ID]: {
        ...clip,
        timeline: {
          durationTicks: 2 * MEASURE_TICKS + 2 * 3_360,
          timeMap,
        },
      },
    },
  };
}

describe("createTimeMapMarkerFlags", () => {
  test("groups meter and tempo markers by tick", () => {
    const flags = createTimeMapMarkerFlags(
      createProjectWithMarkers().clipsById[TEST_CLIP_ID]!.timeline.timeMap,
    );

    expect(flags).toHaveLength(2);
    expect(flags[0]).toMatchObject({
      startTick: 0,
      bpm: 120,
      isInitial: true,
    });
    expect(flags[1]).toMatchObject({
      startTick: 2 * MEASURE_TICKS,
      bpm: 90,
      isInitial: false,
    });
    expect(flags[1]?.timeSignature?.numerator).toBe(7);
  });

  test("supports tempo-only and meter-only flags", () => {
    const flags = createTimeMapMarkerFlags({
      meterMarkers: [
        { startTick: 0, timeSignature: { numerator: 4, denominator: 4 } },
        { startTick: MEASURE_TICKS, timeSignature: { numerator: 3, denominator: 4 } },
      ],
      tempoMarkers: [
        { startTick: 0, bpm: 120 },
        { startTick: 2 * MEASURE_TICKS, bpm: 90 },
      ],
scaleMarkers: [],
    });

    expect(flags.map((flag) => formatMarkerFlagLabel(flag))).toEqual([
      "120 · 4/4",
      "3/4",
      "90",
    ]);
  });
});

describe("createMarkerDraft", () => {
  test("creates a tempo-only draft at exact tick when off-grid", () => {
    const state = createProjectWithMarkers();
    const draft = createMarkerDraft(state, TEST_CLIP_ID, MEASURE_TICKS + 100);

    expect(draft).toEqual({
      mode: "create",
      startTick: MEASURE_TICKS + 100,
      measureIndex: null,
      bpm: 120, // The tempo at 0 is 120, and next is at 2*MEASURE_TICKS
      timeSignature: null,
      canDelete: false,
    });
  });

  test("opens edit mode with existing marker values", () => {
    const state = createProjectWithMarkers();
    const draft = createMarkerDraft(state, TEST_CLIP_ID, 2 * MEASURE_TICKS);

    expect(draft.mode).toBe("edit");
    expect(draft.bpm).toBe(90);
    expect(draft.timeSignature).toEqual({
      numerator: 7,
      denominator: 8,
      beatGroups: [2, 2, 3],
    });
    expect(draft.canDelete).toBe(true);
  });

  test("the tick-0 marker is editable but not deletable", () => {
    const draft = createMarkerDraft(
      createProjectWithMarkers(),
      TEST_CLIP_ID,
      0,
    );

    expect(draft.mode).toBe("edit");
    expect(draft.canDelete).toBe(false);
  });
});

describe("planMarkerDraftCommands", () => {
  test("plans only effective changes", () => {
    const state = createProjectWithMarkers();
    const draft = createMarkerDraft(state, TEST_CLIP_ID, MEASURE_TICKS);

    expect(planMarkerDraftCommands(state, TEST_CLIP_ID, draft)).toEqual([]);

    const changed = planMarkerDraftCommands(state, TEST_CLIP_ID, {
      ...draft,
      bpm: 100,
      timeSignature: { numerator: 3, denominator: 4 },
    });

    expect(changed).toEqual([
      {
        type: "AddMeterMarker",
        clipId: TEST_CLIP_ID,
        startTick: MEASURE_TICKS,
        timeSignature: { numerator: 3, denominator: 4 },
      },
      {
        type: "AddTempoMarker",
        clipId: TEST_CLIP_ID,
        startTick: MEASURE_TICKS,
        bpm: 100,
      },
    ]);
  });

  test("updates existing markers without touching preserved beat groups", () => {
    const state = createProjectWithMarkers();
    const draft = createMarkerDraft(state, TEST_CLIP_ID, 2 * MEASURE_TICKS);
    const commands = planMarkerDraftCommands(state, TEST_CLIP_ID, {
      ...draft,
      bpm: 75,
    });

    expect(commands).toEqual([{
      type: "UpdateTempoMarker",
      clipId: TEST_CLIP_ID,
      startTick: 2 * MEASURE_TICKS,
      bpm: 75,
    }]);
  });

  test("clamps draft tempo to editor limits", () => {
    expect(normalizeDraftBpm(500)).toBe(240);
    expect(normalizeDraftBpm(1)).toBe(30);
    expect(normalizeDraftBpm(Number.NaN)).toBe(120);
  });

  test("normalizes a free-form draft time signature", () => {
    expect(normalizeDraftTimeSignature({
      numerator: 7,
      denominator: 8,
    })).toEqual({ numerator: 7, denominator: 8 });
    expect(normalizeDraftTimeSignature({
      numerator: 99,
      denominator: 8,
    })).toEqual({ numerator: 32, denominator: 8 });
    expect(normalizeDraftTimeSignature({
      numerator: 0,
      denominator: 8,
    })).toEqual({ numerator: 1, denominator: 8 });
  });

  test("drops beat groups that no longer match the numerator", () => {
    expect(normalizeDraftTimeSignature({
      numerator: 5,
      denominator: 8,
      beatGroups: [2, 2, 3],
    })).toEqual({ numerator: 5, denominator: 8 });
    expect(normalizeDraftTimeSignature({
      numerator: 7,
      denominator: 8,
      beatGroups: [2, 2, 3],
    })).toEqual({
      numerator: 7,
      denominator: 8,
      beatGroups: [2, 2, 3],
    });
  });
});

describe("planMarkerDeletionCommands", () => {
  test("deletes every marker at the tick", () => {
    const state = createProjectWithMarkers();

    expect(
      planMarkerDeletionCommands(state, TEST_CLIP_ID, 2 * MEASURE_TICKS),
    ).toEqual([
      {
        type: "DeleteMeterMarker",
        clipId: TEST_CLIP_ID,
        startTick: 2 * MEASURE_TICKS,
      },
      {
        type: "DeleteTempoMarker",
        clipId: TEST_CLIP_ID,
        startTick: 2 * MEASURE_TICKS,
      },
    ]);
    expect(planMarkerDeletionCommands(state, TEST_CLIP_ID, 0)).toEqual([]);
    expect(
      planMarkerDeletionCommands(state, TEST_CLIP_ID, MEASURE_TICKS),
    ).toEqual([]);
  });
});

describe("planMarkerMoveCommands", () => {
  test("moves the marker group to a free tick", () => {
    const state = createProjectWithMarkers();

    expect(
      planMarkerMoveCommands(
        state,
        TEST_CLIP_ID,
        2 * MEASURE_TICKS,
        3_360,
      ),
    ).toEqual([
      {
        type: "MoveMeterMarker",
        clipId: TEST_CLIP_ID,
        startTick: 2 * MEASURE_TICKS,
        targetTick: 3_360,
      },
      {
        type: "MoveTempoMarker",
        clipId: TEST_CLIP_ID,
        startTick: 2 * MEASURE_TICKS,
        targetTick: 3_360,
      },
    ]);
  });

  test("throws an error when moving a tempo companion onto an occupied tick", () => {
    const base = createProjectWithMarkers();
    const clip = base.clipsById[TEST_CLIP_ID];

    if (clip === undefined) {
      throw new Error("The test clip is missing.");
    }

    const state: typeof base = {
      ...base,
      clipsById: {
        ...base.clipsById,
        [TEST_CLIP_ID]: {
          ...clip,
          timeline: {
            ...clip.timeline,
            timeMap: {
              ...clip.timeline.timeMap,
              tempoMarkers: [
                { startTick: 0, bpm: 120 },
                { startTick: MEASURE_TICKS, bpm: 100 },
                { startTick: 2 * MEASURE_TICKS, bpm: 90 },
              ],
scaleMarkers: [],
            },
          },
        },
      },
    };

    expect(() =>
      planMarkerMoveCommands(
        state,
        TEST_CLIP_ID,
        2 * MEASURE_TICKS,
        MEASURE_TICKS,
      ),
    ).toThrowError("A tempo marker already exists at this position.");
  });
});
