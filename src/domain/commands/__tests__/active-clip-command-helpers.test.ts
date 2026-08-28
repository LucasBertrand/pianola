import { describe, expect, test } from "vitest";
import type { TransportState } from "../../transport/transport";
import type { Note } from "../../notes/note";
import {
  assertNoteWithinProject,
  trimProjectToDuration,
} from "../active-clip-note-invariants";
import {
  insertTimeIntoTransport,
  removeTimeFromTransport,
} from "../clip-transport-time-transforms";
import {
  transformInstrumentTracksForInsertedTime,
  transformInstrumentTracksForRemovedTime,
} from "../active-clip-track-time-transforms";
import type { ActiveClipProjectState } from "../active-clip-project-state";
import { CommandRejectedError } from "../command-errors";
import {
  createTestNote,
  createTestProject,
  TEST_CLIP_ID,
  TEST_INSTRUMENT_ID,
} from "../../../../tests/support/test-builders";

function createTransport(
  changes: Partial<TransportState> = {},
): TransportState {
  return {
    loop: { startTick: 2_000, endTick: 8_000 },
    loopEnabled: true,
    ...changes,
  };
}

describe("structural transport edits", () => {
  test("insertion shifts loop endpoints on its right", () => {
    const result = insertTimeIntoTransport(
      createTransport(),
      3_840,
      1_920,
    );

    expect(result.loop).toEqual({ startTick: 2_000, endTick: 9_920 });
  });

  test("removal collapses both loop endpoints", () => {
    const result = removeTimeFromTransport(
      createTransport(),
      3_840,
      6_720,
      10_000,
    );

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

describe("active clip structural invariants", () => {
  test("insertion shifts following notes and extends notes crossing the insertion", () => {
    const state = createActiveClipState([
      createTestNote({ id: "crossing", startTick: 100, durationTicks: 200 }),
      createTestNote({ id: "following", startTick: 500, durationTicks: 120 }),
      createTestNote({ id: "before", startTick: 0, durationTicks: 50 }),
    ]);

    const result = transformInstrumentTracksForInsertedTime(state, 200, 100);
    const notes = result[TEST_INSTRUMENT_ID]?.notesById;

    expect(notes?.["crossing"]).toMatchObject({ startTick: 100, durationTicks: 300 });
    expect(notes?.["following"]).toMatchObject({ startTick: 600, durationTicks: 120 });
    expect(notes?.["before"]).toBe(
      state.tracksByInstrumentId[TEST_INSTRUMENT_ID]?.notesById["before"],
    );
  });

  test("removal collapses, shortens and deletes notes across the removed range", () => {
    const state = createActiveClipState([
      createTestNote({ id: "left-edge", pitch: 60, startTick: 100, durationTicks: 200 }),
      createTestNote({ id: "inside", pitch: 61, startTick: 250, durationTicks: 50 }),
      createTestNote({ id: "spanning", pitch: 62, startTick: 100, durationTicks: 400 }),
      createTestNote({ id: "right", pitch: 63, startTick: 500, durationTicks: 120 }),
    ]);

    const result = transformInstrumentTracksForRemovedTime(state, 200, 400);
    const notes = result[TEST_INSTRUMENT_ID]?.notesById;

    expect(notes?.["left-edge"]).toMatchObject({ startTick: 100, durationTicks: 100 });
    expect(notes?.["inside"]).toBeUndefined();
    expect(notes?.["spanning"]).toMatchObject({ startTick: 100, durationTicks: 200 });
    expect(notes?.["right"]).toMatchObject({ startTick: 300, durationTicks: 120 });
  });

  test("trimming removes out-of-range notes and fits the loop to the clip", () => {
    const state = createActiveClipState([
      createTestNote({ id: "inside", startTick: 0, durationTicks: 120 }),
      createTestNote({ id: "outside", startTick: 3_800, durationTicks: 100 }),
    ]);
    const result = trimProjectToDuration({
      ...state,
      transportSettings: {
        ...state.transportSettings,
        loop: { startTick: 3_700, endTick: 4_100 },
      },
    });

    expect(result.tracksByInstrumentId[TEST_INSTRUMENT_ID]?.notesById)
      .toEqual({ inside: state.tracksByInstrumentId[TEST_INSTRUMENT_ID]?.notesById["inside"] });
    expect(result.transportSettings.loop).toEqual({ startTick: 3_700, endTick: 3_840 });
  });

  test("rejects a note whose end exceeds the clip duration", () => {
    const state = createActiveClipState([]);

    expect(() => assertNoteWithinProject(
      state,
      createTestNote({ id: "outside", startTick: 3_800, durationTicks: 100 }),
      "AddNotes",
    )).toThrow(CommandRejectedError);
  });
});

function createActiveClipState(
  notes: readonly Note[],
): ActiveClipProjectState {
  const project = createTestProject({
    clips: [{ id: TEST_CLIP_ID, measureCount: 1, notes }],
  });
  const clip = project.clipsById[TEST_CLIP_ID]!;

  return {
    projectInstrumentsById: project.projectInstrumentsById,
    instrumentOrder: project.instrumentOrder,
    clock: project.clock,
    timeline: clip.timeline,
    tracksByInstrumentId: clip.tracksByInstrumentId,
    transportSettings: clip.transportSettings,
  };
}
