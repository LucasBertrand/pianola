import { describe, expect, test } from "vitest";
import {
  createTimeMapMarkerFlags,
  createMarkerDraft,
  formatMarkerFlagLabel,
  isIsolatedMeterMarkerFlag,
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
    scaleMarkers: [{
      startTick: 0,
      rootNote: "C",
      patternType: "scale",
      patternId: "ionian",
    }],
    sectionMarkers: [],
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
      scaleMarkers: [{
        startTick: 0,
        rootNote: "C",
        patternType: "scale",
        patternId: "ionian",
      }],
      sectionMarkers: [],
    });

    expect(flags.map((flag) => formatMarkerFlagLabel(flag))).toEqual([
      "120 · 4/4 · C ionian",
      "3/4",
      "90",
    ]);
    expect(isIsolatedMeterMarkerFlag(flags[0]!)).toBe(false);
    expect(isIsolatedMeterMarkerFlag(flags[1]!)).toBe(true);
    expect(isIsolatedMeterMarkerFlag(flags[2]!)).toBe(false);
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
      tempoIncluded: false,
      meterIncluded: false,
      scaleIncluded: false,
      sectionIncluded: false,
      canChangeMarkerTypes: true,
      bpm: 120, // The tempo at 0 is 120, and next is at 2*MEASURE_TICKS
      timeSignature: null,
      rootNote: "C",
      patternType: "scale",
      patternId: "ionian",
      sectionComment: "",
      canDelete: false,
    });
  });

  test("opens edit mode with existing marker values", () => {
    const state = createProjectWithMarkers();
    const draft = createMarkerDraft(state, TEST_CLIP_ID, 2 * MEASURE_TICKS);

    expect(draft.mode).toBe("edit");
    expect(draft.tempoIncluded).toBe(true);
    expect(draft.meterIncluded).toBe(true);
    expect(draft.scaleIncluded).toBe(false);
    expect(draft.canChangeMarkerTypes).toBe(true);
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
    expect(draft.tempoIncluded).toBe(true);
    expect(draft.meterIncluded).toBe(true);
    expect(draft.scaleIncluded).toBe(true);
    expect(draft.canChangeMarkerTypes).toBe(false);
    expect(draft.canDelete).toBe(false);
  });
});

describe("planMarkerDraftCommands", () => {
  test("creates a section comment at an arbitrary tick", () => {
    const state = createProjectWithMarkers();
    const draft = createMarkerDraft(
      state,
      TEST_CLIP_ID,
      MEASURE_TICKS + 120,
    );

    expect(planMarkerDraftCommands(state, TEST_CLIP_ID, {
      ...draft,
      sectionIncluded: true,
      sectionComment: "  Chorus  ",
    })).toEqual([{
      type: "AddSectionMarker",
      clipId: TEST_CLIP_ID,
      startTick: MEASURE_TICKS + 120,
      comment: "Chorus",
    }]);
  });

  test("requires a non-empty section comment", () => {
    const state = createProjectWithMarkers();
    const draft = createMarkerDraft(state, TEST_CLIP_ID, MEASURE_TICKS);

    expect(() => planMarkerDraftCommands(state, TEST_CLIP_ID, {
      ...draft,
      sectionIncluded: true,
      sectionComment: "   ",
    })).toThrowError("A section marker comment cannot be empty.");
  });

  test("creates only the explicitly selected marker types", () => {
    const state = createProjectWithMarkers();
    const draft = createMarkerDraft(state, TEST_CLIP_ID, MEASURE_TICKS);

    expect(planMarkerDraftCommands(state, TEST_CLIP_ID, draft)).toEqual([]);

    const selected = planMarkerDraftCommands(state, TEST_CLIP_ID, {
      ...draft,
      tempoIncluded: true,
      meterIncluded: true,
      bpm: 100,
      timeSignature: { numerator: 3, denominator: 4 },
    });

    expect(selected).toEqual([
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

  test("creates selected markers even when values repeat the active timeline", () => {
    const state = createProjectWithMarkers();
    const draft = createMarkerDraft(state, TEST_CLIP_ID, MEASURE_TICKS);
    const commands = planMarkerDraftCommands(state, TEST_CLIP_ID, {
      ...draft,
      tempoIncluded: true,
      meterIncluded: true,
      scaleIncluded: true,
    });

    expect(commands).toEqual([
      {
        type: "AddMeterMarker",
        clipId: TEST_CLIP_ID,
        startTick: MEASURE_TICKS,
        timeSignature: { numerator: 4, denominator: 4 },
      },
      {
        type: "AddTempoMarker",
        clipId: TEST_CLIP_ID,
        startTick: MEASURE_TICKS,
        bpm: 120,
      },
      {
        type: "AddScaleMarker",
        clipId: TEST_CLIP_ID,
        marker: {
          startTick: MEASURE_TICKS,
          rootNote: "C",
          patternType: "scale",
          patternId: "ionian",
        },
      },
    ]);
  });

  test("updates existing values without materializing unselected components", () => {
    const state = createProjectWithMarkers();
    const draft = createMarkerDraft(state, TEST_CLIP_ID, 2 * MEASURE_TICKS);
    const commands = planMarkerDraftCommands(state, TEST_CLIP_ID, {
      ...draft,
      bpm: 75,
    });

    expect(commands).toEqual([
      {
        type: "UpdateTempoMarker",
        clipId: TEST_CLIP_ID,
        startTick: 2 * MEASURE_TICKS,
        bpm: 75,
      },
    ]);
  });

  test("adds a missing component when it is explicitly selected", () => {
    const state = createProjectWithMarkers();
    const draft = createMarkerDraft(state, TEST_CLIP_ID, 2 * MEASURE_TICKS);
    const commands = planMarkerDraftCommands(state, TEST_CLIP_ID, {
      ...draft,
      scaleIncluded: true,
    });

    expect(commands).toEqual([
      {
        type: "AddScaleMarker",
        clipId: TEST_CLIP_ID,
        marker: {
          startTick: 2 * MEASURE_TICKS,
          rootNote: "C",
          patternType: "scale",
          patternId: "ionian",
        },
      },
    ]);
  });

  test("deletes an existing component when it is unselected", () => {
    const state = createProjectWithMarkers();
    const draft = createMarkerDraft(state, TEST_CLIP_ID, 2 * MEASURE_TICKS);

    expect(planMarkerDraftCommands(state, TEST_CLIP_ID, {
      ...draft,
      tempoIncluded: false,
    })).toEqual([{
      type: "DeleteTempoMarker",
      clipId: TEST_CLIP_ID,
      startTick: 2 * MEASURE_TICKS,
    }]);
  });

  test("keeps every initial marker component mandatory", () => {
    const state = createProjectWithMarkers();
    const draft = createMarkerDraft(state, TEST_CLIP_ID, 0);

    expect(() => planMarkerDraftCommands(state, TEST_CLIP_ID, {
      ...draft,
      tempoIncluded: false,
    })).toThrowError(
      "The initial tempo, meter, and scale markers are required.",
    );
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
  test("moves only the optional section from the initial flag", () => {
    const base = createProjectWithMarkers();
    const clip = base.clipsById[TEST_CLIP_ID]!;
    const state = {
      ...base,
      clipsById: {
        ...base.clipsById,
        [TEST_CLIP_ID]: {
          ...clip,
          timeline: {
            ...clip.timeline,
            timeMap: {
              ...clip.timeline.timeMap,
              sectionMarkers: [{ startTick: 0, comment: "Intro" }],
            },
          },
        },
      },
    };

    expect(planMarkerMoveCommands(
      state,
      TEST_CLIP_ID,
      0,
      960,
    )).toEqual([{
      type: "MoveSectionMarker",
      clipId: TEST_CLIP_ID,
      startTick: 0,
      targetTick: 960,
    }]);
  });

  test("moves grouped point markers without moving their meter", () => {
    const state = createProjectWithMarkers();

    expect(
      planMarkerMoveCommands(
        state,
        TEST_CLIP_ID,
        2 * MEASURE_TICKS,
        MEASURE_TICKS,
      ),
    ).toEqual([{
      type: "MoveTempoMarker",
      clipId: TEST_CLIP_ID,
      startTick: 2 * MEASURE_TICKS,
      targetTick: MEASURE_TICKS,
    }]);
  });

  test("moves point markers and reports their collisions", () => {
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
                { startTick: MEASURE_TICKS + 960, bpm: 90 },
              ],
                scaleMarkers: [{
                  startTick: 0,
                  rootNote: "C",
                  patternType: "scale",
                  patternId: "ionian",
                }],
            },
          },
        },
      },
    };

    expect(() =>
      planMarkerMoveCommands(
        state,
        TEST_CLIP_ID,
        MEASURE_TICKS + 960,
        MEASURE_TICKS,
      ),
    ).toThrowError("A tempo marker already exists at this position.");
  });
});
