import {
  describe,
  expect,
  test,
} from "vitest";
import {
  createEditorRuntime,
} from "../../src/app/create-app-runtime";
import {
  getActiveClip,
  type ProjectState,
} from "../../src/domain/project/project-document";
import {
  getMeasureCount,
  type TimeMap,
} from "../../src/domain/transport/time-map";
import {
  buildAddNoteCommands,
  buildDeleteNoteCommands,
} from "../../src/use-cases/piano-roll/notes/note-edit-commands";
import {
  buildDeleteClipboardMarkerCommands,
  buildDeleteSelectedMarkerCommands,
  canPlacePastedTimelineContent,
  createPastedMarkerGroups,
  createPastedNotes,
  createPianoRollClipboard,
  getRequiredMeasureCountForTimelineContent,
  planPastedMarkerCommands,
} from "../../src/use-cases/piano-roll/selection/selection-edit-plans";
import {
  createTestNote,
  createTestProject,
  TEST_CLIP_ID,
  TEST_INSTRUMENT_ID,
} from "../support/test-builders";

const SOURCE_NOTE_TICK = 3_360;
const SOURCE_MARKER_TICK = 3_840;
const SECOND_MARKER_TICK = 4_080;

describe("timeline clipboard", () => {
  test("captures selected marker components and preserves mixed offsets", () => {
    const note = createTestNote({
      id: "clipboard-note",
      startTick: SOURCE_NOTE_TICK,
    });
    const state = createClipboardProject(note);
    const timeMap = getActiveClip(state).timeline.timeMap;
    const clipboard = createPianoRollClipboard(
      [note],
      [
        { startTick: SOURCE_MARKER_TICK, kinds: ["tempo"] },
        { startTick: SECOND_MARKER_TICK, kinds: ["scale"] },
      ],
      timeMap,
    );

    expect(clipboard).not.toBeNull();
    expect(clipboard?.originTick).toBe(SOURCE_NOTE_TICK);
    expect(clipboard?.markerGroups).toEqual([
      {
        startTick: SOURCE_MARKER_TICK,
        tempoBpm: 90,
        scaleMarker: null,
      },
      {
        startTick: SECOND_MARKER_TICK,
        tempoBpm: null,
        scaleMarker: {
          rootNote: "E",
          patternType: "scale",
          patternId: "dorian",
        },
      },
    ]);

    if (clipboard === null) {
      throw new Error("Expected a mixed clipboard.");
    }

    const pastedNotes = createPastedNotes(clipboard, 3_840, 1, 1);
    const pastedMarkers = createPastedMarkerGroups(clipboard, 3_840);

    expect(pastedNotes[0]?.startTick).toBe(3_840);
    expect(pastedMarkers.map((group) => group.startTick)).toEqual([
      4_320,
      4_560,
    ]);
  });

  test("plans explicit overwrite commands for tempo and scale collisions", () => {
    const state = withTimeMap(
      createClipboardProject(),
      (timeMap) => ({
        ...timeMap,
        tempoMarkers: [
          ...timeMap.tempoMarkers,
          { startTick: 4_320, bpm: 140 },
        ],
        scaleMarkers: [
          ...timeMap.scaleMarkers,
          {
            startTick: 4_560,
            rootNote: "F",
            patternType: "scale",
            patternId: "lydian",
          },
        ],
      }),
    );
    const clipboard = createPianoRollClipboard(
      [],
      [
        { startTick: SOURCE_MARKER_TICK, kinds: ["tempo"] },
        { startTick: SECOND_MARKER_TICK, kinds: ["scale"] },
      ],
      getActiveClip(state).timeline.timeMap,
    );

    if (clipboard === null) {
      throw new Error("Expected a marker clipboard.");
    }

    const pastedMarkers = createPastedMarkerGroups(clipboard, 4_320);
    const plan = planPastedMarkerCommands(
      state,
      TEST_CLIP_ID,
      pastedMarkers,
    );

    expect(plan.collisions).toEqual([
      { kind: "tempo", targetTick: 4_320 },
      { kind: "scale", targetTick: 4_560 },
    ]);
    expect(plan.overwriteCommands).toEqual([
      {
        type: "UpdateTempoMarker",
        clipId: TEST_CLIP_ID,
        startTick: 4_320,
        bpm: 90,
      },
      {
        type: "UpdateScaleMarker",
        clipId: TEST_CLIP_ID,
        startTick: 4_560,
        changes: {
          rootNote: "E",
          patternType: "scale",
          patternId: "dorian",
        },
      },
    ]);
  });

  test("resolves pasted markers at tick zero as initial-marker collisions", () => {
    const state = createClipboardProject();
    const clip = getActiveClip(state);
    const markerGroups = [{
      startTick: 0,
      tempoBpm: 90,
      scaleMarker: {
        rootNote: "D",
        patternType: "scale" as const,
        patternId: "dorian",
      },
    }];

    expect(canPlacePastedTimelineContent(
      state,
      TEST_CLIP_ID,
      [],
      markerGroups,
    )).toBe(true);
    expect(getRequiredMeasureCountForTimelineContent(
      state,
      TEST_CLIP_ID,
      [],
      markerGroups,
    )).toBe(getMeasureCount(
      state.clock.ppqn,
      clip.timeline.timeMap,
      clip.timeline.durationTicks,
    ));

    const plan = planPastedMarkerCommands(
      state,
      TEST_CLIP_ID,
      markerGroups,
    );

    expect(plan.collisions).toEqual([
      { kind: "tempo", targetTick: 0 },
      { kind: "scale", targetTick: 0 },
    ]);
    expect(plan.overwriteCommands).toEqual([
      {
        type: "UpdateTempoMarker",
        clipId: TEST_CLIP_ID,
        startTick: 0,
        bpm: 90,
      },
      {
        type: "UpdateScaleMarker",
        clipId: TEST_CLIP_ID,
        startTick: 0,
        changes: {
          rootNote: "D",
          patternType: "scale",
          patternId: "dorian",
        },
      },
    ]);
    expect(plan.resultingMarkerGroups).toEqual([]);

    const runtime = createEditorRuntime(state);

    runtime.editorCommands.dispatch(
      plan.overwriteCommands,
      "Overwrite initial markers",
    );

    const updatedTimeMap = getActiveClip(runtime.projectStore.getState())
      .timeline.timeMap;

    expect(updatedTimeMap.tempoMarkers[0]?.bpm).toBe(90);
    expect(markerAt(runtime, "scale", 0)).toEqual({
      startTick: 0,
      rootNote: "D",
      patternType: "scale",
      patternId: "dorian",
    });
  });

  test("cuts only selected flag components and restores them with undo", () => {
    const note = createTestNote({
      id: "cut-note",
      startTick: SOURCE_NOTE_TICK,
    });
    const runtime = createEditorRuntime(createClipboardProject(note));
    const timeMap = getActiveClip(runtime.projectStore.getState())
      .timeline.timeMap;
    const selectedMarkerGroup = {
      startTick: SOURCE_MARKER_TICK,
      kinds: ["tempo"] as const,
    };

    runtime.selection.add(note);
    runtime.selection.addMarkerGroup(selectedMarkerGroup);
    const clipboard = createPianoRollClipboard(
      runtime.selection.notes,
      runtime.selection.markerGroups,
      timeMap,
    );

    if (clipboard === null) {
      throw new Error("Expected a cut clipboard.");
    }

    runtime.editorCommands.dispatch(
      [
        ...buildDeleteNoteCommands(TEST_CLIP_ID, clipboard.notes),
        ...buildDeleteClipboardMarkerCommands(
          TEST_CLIP_ID,
          clipboard.markerGroups,
        ),
      ],
      "Cut timeline selection",
      { clipId: TEST_CLIP_ID, noteIds: [], markerGroups: [] },
    );
    runtime.selection.clear();

    expect(activeNote(runtime, note.id)).toBeUndefined();
    expect(markerAt(runtime, "tempo", SOURCE_MARKER_TICK)).toBeUndefined();
    expect(markerAt(runtime, "scale", SOURCE_MARKER_TICK)).toBeDefined();
    expect(markerAt(runtime, "meter", SOURCE_MARKER_TICK)).toBeDefined();

    runtime.editorCommands.undo();

    expect(activeNote(runtime, note.id)).toEqual(note);
    expect(markerAt(runtime, "tempo", SOURCE_MARKER_TICK)).toBeDefined();
    expect(runtime.selection.notes.map((selected) => selected.id)).toEqual([
      note.id,
    ]);
    expect(runtime.selection.markerGroups).toEqual([selectedMarkerGroup]);

    runtime.editorCommands.redo();

    expect(activeNote(runtime, note.id)).toBeUndefined();
    expect(markerAt(runtime, "tempo", SOURCE_MARKER_TICK)).toBeUndefined();
    expect(runtime.selection.size).toBe(0);
  });

  test("deletes selected marker components through the selection command plan", () => {
    const runtime = createEditorRuntime(createClipboardProject());
    const commands = buildDeleteSelectedMarkerCommands(
      TEST_CLIP_ID,
      [{ startTick: SOURCE_MARKER_TICK, kinds: ["tempo"] }],
    );

    expect(commands).toEqual([{
      type: "DeleteTempoMarker",
      clipId: TEST_CLIP_ID,
      startTick: SOURCE_MARKER_TICK,
    }]);

    runtime.editorCommands.dispatch(commands, "Delete markers");

    expect(markerAt(runtime, "tempo", SOURCE_MARKER_TICK)).toBeUndefined();
    expect(markerAt(runtime, "scale", SOURCE_MARKER_TICK)).toBeDefined();
    expect(markerAt(runtime, "meter", SOURCE_MARKER_TICK)).toBeDefined();
  });

  test("restores source and pasted mixed selections through undo and redo", () => {
    const note = createTestNote({
      id: "source-note",
      startTick: SOURCE_NOTE_TICK,
    });
    const runtime = createEditorRuntime(withTimeMap(
      createClipboardProject(note),
      (timeMap) => ({
        ...timeMap,
        tempoMarkers: [
          ...timeMap.tempoMarkers,
          { startTick: 4_200, bpm: 120 },
        ],
      }),
    ));
    const state = runtime.projectStore.getState();
    const selectedMarkerGroup = {
      startTick: SOURCE_MARKER_TICK,
      kinds: ["tempo", "scale"] as const,
    };

    runtime.selection.add(note);
    runtime.selection.addMarkerGroup(selectedMarkerGroup);
    const clipboard = createPianoRollClipboard(
      runtime.selection.notes,
      runtime.selection.markerGroups,
      getActiveClip(state).timeline.timeMap,
    );

    if (clipboard === null) {
      throw new Error("Expected a mixed clipboard.");
    }

    const pastedNotes = createPastedNotes(clipboard, 3_840, 2, 1);
    const pastedMarkers = createPastedMarkerGroups(clipboard, 3_840);
    const markerPlan = planPastedMarkerCommands(
      state,
      TEST_CLIP_ID,
      pastedMarkers,
    );
    const pastedNoteIds = pastedNotes.map((pastedNote) => pastedNote.id);
    const nextState = runtime.editorCommands.dispatch(
      [
        ...markerPlan.commands,
        ...buildAddNoteCommands(TEST_CLIP_ID, pastedNotes),
      ],
      "Paste timeline selection",
      {
        clipId: TEST_CLIP_ID,
        noteIds: pastedNoteIds,
        markerGroups: markerPlan.resultingMarkerGroups,
      },
    );

    expect(nextState).not.toBeNull();
    if (nextState === null) {
      throw new Error("Expected the paste transaction to commit.");
    }

    runtime.selection.replaceFromIdentifiers(
      nextState,
      pastedNoteIds,
      markerPlan.resultingMarkerGroups,
    );
    expect(runtime.selection.markerGroups).toEqual([{
      startTick: 4_320,
      kinds: ["tempo", "scale"],
    }]);

    runtime.editorCommands.undo();

    expect(activeNote(runtime, pastedNoteIds[0]!)).toBeUndefined();
    expect(runtime.selection.notes.map((selected) => selected.id)).toEqual([
      note.id,
    ]);
    expect(runtime.selection.markerGroups).toEqual([selectedMarkerGroup]);

    runtime.editorCommands.redo();

    expect(activeNote(runtime, pastedNoteIds[0]!)).toBeDefined();
    expect(runtime.selection.notes.map((selected) => selected.id)).toEqual(
      pastedNoteIds,
    );
    expect(runtime.selection.markerGroups).toEqual([{
      startTick: 4_320,
      kinds: ["tempo", "scale"],
    }]);
  });
});

function createClipboardProject(
  note = createTestNote({ id: "unused", startTick: 7_000 }),
): ProjectState {
  return withTimeMap(
    createTestProject({
      clips: [{ id: TEST_CLIP_ID, notes: [note] }],
    }),
    (timeMap) => ({
      meterMarkers: [
        timeMap.meterMarkers[0]!,
        {
          startTick: SOURCE_MARKER_TICK,
          timeSignature: { numerator: 3, denominator: 4 },
        },
      ],
      tempoMarkers: [
        timeMap.tempoMarkers[0]!,
        { startTick: SOURCE_MARKER_TICK, bpm: 90 },
      ],
      scaleMarkers: [
        timeMap.scaleMarkers[0]!,
        {
          startTick: SOURCE_MARKER_TICK,
          rootNote: "D",
          patternType: "scale",
          patternId: "ionian",
        },
        {
          startTick: SECOND_MARKER_TICK,
          rootNote: "E",
          patternType: "scale",
          patternId: "dorian",
        },
      ],
    }),
  );
}

function withTimeMap(
  state: ProjectState,
  update: (timeMap: TimeMap) => TimeMap,
): ProjectState {
  const clip = getActiveClip(state);

  return {
    ...state,
    clipsById: {
      ...state.clipsById,
      [clip.id]: {
        ...clip,
        timeline: {
          ...clip.timeline,
          timeMap: update(clip.timeline.timeMap),
        },
      },
    },
  };
}

function activeNote(
  runtime: ReturnType<typeof createEditorRuntime>,
  noteId: string,
) {
  return getActiveClip(runtime.projectStore.getState())
    .tracksByInstrumentId[TEST_INSTRUMENT_ID]?.notesById[noteId];
}

function markerAt(
  runtime: ReturnType<typeof createEditorRuntime>,
  kind: "meter" | "tempo" | "scale",
  startTick: number,
) {
  const timeMap = getActiveClip(runtime.projectStore.getState())
    .timeline.timeMap;

  return kind === "meter"
    ? timeMap.meterMarkers.find((marker) => marker.startTick === startTick)
    : kind === "tempo"
      ? timeMap.tempoMarkers.find((marker) => marker.startTick === startTick)
      : timeMap.scaleMarkers.find((marker) => marker.startTick === startTick);
}
