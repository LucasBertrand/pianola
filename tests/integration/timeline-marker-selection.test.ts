import {
  describe,
  expect,
  test,
} from "vitest";
import {
  createEditorRuntime,
} from "../../src/bootstrap/create-app-runtime";
import {
  getActiveClip,
  type EditorSessionState,
} from "../../src/domain/project/project-document";
import type {
  TimeMap,
} from "../../src/domain/transport/time-map";
import {
  PianoRollInteractionSession,
} from "../../src/editor-core/interactions/piano-roll-interaction-session";
import {
  createSelectedMarkerGroup,
} from "../../src/editor-core/selection/editor-selection";
import type {
  GestureCompletion,
} from "../../src/editor-core/interactions/gestures/gesture-state-machine";
import {
  NoteGestureWorkflow,
} from "../../src/application/piano-roll/notes/note-gesture-workflow";
import {
  resolveEffectiveTimeMap,
} from "../../src/application/editor-session/time-map-marker-preview-session";
import {
  resolvePitchSnapSettings,
} from "../../src/application/piano-roll/timeline/pitch-snap-resolution";
import {
  planSelectedMarkerMove,
} from "../../src/application/piano-roll/selection/timeline-selection-move";
import {
  planMarkerMove,
} from "../../src/application/piano-roll/timeline/time-map-marker-plans";
import {
  createNoteCollisionResolutionPlan,
} from "../../src/domain/note-collision";
import {
  buildRepositionedNotes,
} from "../../src/editor-core/interactions/gestures/note-gesture-math";
import type {
  NoteCollisionResolutionRequest,
} from "../../src/application/piano-roll/notes/note-collision-resolution";
import type {
  MarkerCollisionResolutionRequest,
} from "../../src/application/piano-roll/timeline/marker-collision-resolution";
import {
  completePianoRollLasso,
} from "../../src/presentation/piano-roll/interactions/complete-piano-roll-lasso";
import {
  PianoRollSelectionController,
} from "../../src/presentation/piano-roll/interactions/piano-roll-selection-controller";
import {
  createTestNote,
  createTestProject,
  TEST_CLIP_ID,
  TEST_INSTRUMENT_ID,
} from "../support/test-builders";

const MIXED_MARKER_TICK = 3_840;

describe("timeline marker selection", () => {
  test("lasso extracts movable markers from a flag but excludes its meter", () => {
    const runtime = createEditorRuntime(createProjectWithMixedFlag());
    const session = new PianoRollInteractionSession(
      runtime.viewport.get(),
      runtime.viewport.version,
      runtime.selection,
    );
    const controller = new PianoRollSelectionController({
      session,
      viewport: runtime.viewport,
      editorCommands: runtime.editorCommands,
      getVisuals: () => null,
      onSelectionChange: undefined,
    });
    const converter = session.converter;

    completePianoRollLasso({
      completion: createLassoCompletion(
        converter.tickToCssPixelX(MIXED_MARKER_TICK - 120),
        converter.tickToCssPixelX(MIXED_MARKER_TICK + 120),
      ),
      converter,
      selectionController: controller,
      spatialIndex: runtime.spatialIndex,
      timeMap: getActiveClip(runtime.projectStore.getState()).timeline.timeMap,
      resultBuffer: [],
      visuals: null,
    });

    expect(runtime.selection.markerGroups).toEqual([{
      startTick: MIXED_MARKER_TICK,
      kinds: ["tempo", "scale", "section"],
    }]);
  });

  test("moves selected point markers with notes and leaves meter in place", () => {
    const note = createTestNote({
      id: "selected-note",
      startTick: MIXED_MARKER_TICK,
      durationTicks: 240,
    });
    const runtime = createEditorRuntime(createProjectWithMixedFlag(note));
    const group = createSelectedMarkerGroup(
      MIXED_MARKER_TICK,
      true,
      true,
      true,
    );

    expect(group).not.toBeNull();
    runtime.selection.add(note);
    runtime.selection.addMarkerGroup(group!);
    const workflow = new NoteGestureWorkflow(
      runtime.editorCommands,
      runtime.selection,
      {
        onCollision: undefined,
        onTransactionRejected(error): void {
          throw error;
        },
        onSelectionChanged: undefined,
      },
    );

    expect(workflow.commitMove(
      [{ ...note, startTick: note.startTick + 240 }],
      240,
    )).toBe("committed");

    expect(activeMarkerTicks(runtime, "meter")).toContain(MIXED_MARKER_TICK);
    expect(activeMarkerTicks(runtime, "tempo")).toContain(
      MIXED_MARKER_TICK + 240,
    );
    expect(activeMarkerTicks(runtime, "scale")).toContain(
      MIXED_MARKER_TICK + 240,
    );
    expect(activeMarkerTicks(runtime, "section")).toContain(
      MIXED_MARKER_TICK + 240,
    );
    expect(runtime.selection.markerGroups[0]?.startTick).toBe(
      MIXED_MARKER_TICK + 240,
    );

    runtime.editorCommands.undo();
    expect(activeMarkerTicks(runtime, "meter")).toContain(MIXED_MARKER_TICK);
    expect(activeMarkerTicks(runtime, "tempo")).toContain(MIXED_MARKER_TICK);
    expect(runtime.selection.markerGroups[0]?.startTick).toBe(
      MIXED_MARKER_TICK,
    );

    runtime.editorCommands.redo();
    expect(activeMarkerTicks(runtime, "tempo")).toContain(
      MIXED_MARKER_TICK + 240,
    );
    expect(runtime.selection.markerGroups[0]?.startTick).toBe(
      MIXED_MARKER_TICK + 240,
    );
  });

  test("commits a selected marker move at the exact clip end", () => {
    const runtime = createEditorRuntime(createProjectWithTempoCollision());
    const durationTicks = getActiveClip(runtime.projectStore.getState())
      .timeline.durationTicks;
    const markerGroup = createSelectedMarkerGroup(1_200, true, false);

    expect(markerGroup).not.toBeNull();
    runtime.selection.addMarkerGroup(markerGroup!);

    const workflow = new NoteGestureWorkflow(
      runtime.editorCommands,
      runtime.selection,
      {
        onCollision: undefined,
        onTransactionRejected(error): void {
          throw error;
        },
        onSelectionChanged: undefined,
      },
    );

    expect(workflow.commitMove([], durationTicks - 1_200))
      .toBe("committed");
    expect(activeMarkerTicks(runtime, "tempo")).toContain(durationTicks);
    expect(runtime.selection.markerGroups).toEqual([{
      startTick: durationTicks,
      kinds: ["tempo"],
    }]);
  });

  test("snaps a moved note against the projected scale before publishing both", () => {
    const note = createTestNote({
      id: "projected-scale-note",
      startTick: 960,
      durationTicks: 240,
      pitch: 60,
    });
    const state = createTestProject({
      clips: [{ id: TEST_CLIP_ID, notes: [note] }],
    });
    const clip = getActiveClip(state);
    const runtime = createEditorRuntime(withTimeMap(state, {
      ...clip.timeline.timeMap,
      scaleMarkers: [
        clip.timeline.timeMap.scaleMarkers[0]!,
        {
          startTick: 960,
          rootNote: "D",
          patternType: "scale",
          patternId: "ionian",
        },
      ],
    }));
    const markerGroup = createSelectedMarkerGroup(960, false, true);

    expect(markerGroup).not.toBeNull();
    runtime.selection.add(note);
    runtime.selection.addMarkerGroup(markerGroup!);
    runtime.pitchSnapSettings.set({
      ...runtime.pitchSnapSettings.get(),
      enabled: true,
    });

    const token = runtime.timeMapMarkerPreview.begin({
      clipId: TEST_CLIP_ID,
      movedGroups: [markerGroup!],
    });
    runtime.timeMapMarkerPreview.update(token, 240);

    const publishedBeforeCommit = getActiveClip(
      runtime.projectStore.getState(),
    ).timeline.timeMap;
    const effectiveTimeMap = resolveEffectiveTimeMap(
      publishedBeforeCommit,
      runtime.timeMapMarkerPreview.signal.get(),
      TEST_CLIP_ID,
      runtime.projectStore.getState().revision,
    );

    expect(publishedBeforeCommit.scaleMarkers.map((marker) => marker.startTick))
      .toContain(960);
    expect(effectiveTimeMap.scaleMarkers.map((marker) => marker.startTick))
      .toContain(1_200);

    const workflow = new NoteGestureWorkflow(
      runtime.editorCommands,
      runtime.selection,
      {
        onCollision: undefined,
        onTransactionRejected(error): void {
          throw error;
        },
        onSelectionChanged: undefined,
      },
    );
    const proposedNotes = buildRepositionedNotes(
      [note],
      240,
      0,
      (tick) => resolvePitchSnapSettings(
        effectiveTimeMap,
        runtime.pitchSnapSettings.get(),
        tick,
      ),
    );

    expect(proposedNotes[0]?.pitch).toBe(59);
    expect(workflow.commitMove(proposedNotes, 240)).toBe("committed");

    const committedClip = getActiveClip(runtime.projectStore.getState());
    expect(committedClip.tracksByInstrumentId[TEST_INSTRUMENT_ID]
      ?.notesById[note.id]).toMatchObject({
        startTick: 1_200,
        pitch: 59,
      });
    expect(committedClip.timeline.timeMap.scaleMarkers
      .map((marker) => marker.startTick)).toContain(1_200);
    expect(runtime.timeMapMarkerPreview.signal.get()).toBeNull();
  });

  test("orders chained marker moves so selected destinations are vacated", () => {
    const state = createProjectWithMixedFlag();
    const clip = getActiveClip(state);
    const nextState = withTimeMap(state, {
      ...clip.timeline.timeMap,
      tempoMarkers: [
        { startTick: 0, bpm: 120 },
        { startTick: 960, bpm: 100 },
        { startTick: 1_200, bpm: 90 },
      ],
    });
    const plan = planSelectedMarkerMove(
      nextState,
      TEST_CLIP_ID,
      [
        { startTick: 960, kinds: ["tempo"] },
        { startTick: 1_200, kinds: ["tempo"] },
      ],
      240,
    );

    expect(plan.commands).toEqual([
      {
        type: "MoveTempoMarker",
        clipId: TEST_CLIP_ID,
        startTick: 1_200,
        targetTick: 1_440,
      },
      {
        type: "MoveTempoMarker",
        clipId: TEST_CLIP_ID,
        startTick: 960,
        targetTick: 1_200,
      },
    ]);
  });

  test("resolves grouped marker collisions at tick zero without removing initial markers", () => {
    const state = createProjectWithMixedFlag();
    const collisionPlan = planSelectedMarkerMove(
      state,
      TEST_CLIP_ID,
      [{
        startTick: MIXED_MARKER_TICK,
        kinds: ["tempo", "scale", "section"],
      }],
      -MIXED_MARKER_TICK,
    );

    expect(collisionPlan).toMatchObject({
      commands: [],
      resultingMarkerGroups: [{ startTick: 0, kinds: ["section"] }],
      collisions: [
        { kind: "tempo", targetTick: 0 },
        { kind: "scale", targetTick: 0 },
      ],
    });
    const overwritePlan = planSelectedMarkerMove(
      state,
      TEST_CLIP_ID,
      [{
        startTick: MIXED_MARKER_TICK,
        kinds: ["tempo", "scale", "section"],
      }],
      -MIXED_MARKER_TICK,
      true,
    );

    expect(overwritePlan.commands).toEqual([
      {
        type: "UpdateTempoMarker",
        clipId: TEST_CLIP_ID,
        startTick: 0,
        bpm: 90,
      },
      {
        type: "DeleteTempoMarker",
        clipId: TEST_CLIP_ID,
        startTick: MIXED_MARKER_TICK,
      },
      {
        type: "UpdateScaleMarker",
        clipId: TEST_CLIP_ID,
        startTick: 0,
        changes: {
          rootNote: "D",
          patternType: "scale",
          patternId: "ionian",
        },
      },
      {
        type: "DeleteScaleMarker",
        clipId: TEST_CLIP_ID,
        startTick: MIXED_MARKER_TICK,
      },
      {
        type: "MoveSectionMarker",
        clipId: TEST_CLIP_ID,
        startTick: MIXED_MARKER_TICK,
        targetTick: 0,
      },
    ]);

    const runtime = createEditorRuntime(state);
    runtime.editorCommands.dispatch(
      overwritePlan.commands,
      "Overwrite initial markers",
    );
    const timeMap = getActiveClip(runtime.projectStore.getState()).timeline.timeMap;

    expect(timeMap.tempoMarkers).toContainEqual({ startTick: 0, bpm: 90 });
    expect(timeMap.tempoMarkers.some(
      (marker) => marker.startTick === MIXED_MARKER_TICK,
    )).toBe(false);
    expect(timeMap.scaleMarkers[0]).toMatchObject({
      startTick: 0,
      rootNote: "D",
    });
    expect(timeMap.sectionMarkers).toContainEqual({
      startTick: 0,
      comment: "Verse",
    });
  });

  test("plans cancel-or-overwrite for a standalone marker collision", () => {
    const state = createProjectWithTempoCollision();
    const collisionPlan = planMarkerMove(
      state,
      TEST_CLIP_ID,
      960,
      1_200,
    );

    expect(collisionPlan.commands).toEqual([]);
    expect(collisionPlan.collisions).toEqual([{
      kind: "tempo",
      targetTick: 1_200,
    }]);
    expect(
      planMarkerMove(state, TEST_CLIP_ID, 960, 1_200, true).commands,
    ).toEqual([
      {
        type: "DeleteTempoMarker",
        clipId: TEST_CLIP_ID,
        startTick: 1_200,
      },
      {
        type: "MoveTempoMarker",
        clipId: TEST_CLIP_ID,
        startTick: 960,
        targetTick: 1_200,
      },
    ]);
  });

  test("requests overwrite when a marker-only selection collides", () => {
    const runtime = createEditorRuntime(createProjectWithTempoCollision());
    const markerGroup = createSelectedMarkerGroup(960, true, false);
    let markerRequest: MarkerCollisionResolutionRequest | null = null;

    expect(markerGroup).not.toBeNull();
    runtime.selection.addMarkerGroup(markerGroup!);
    const workflow = new NoteGestureWorkflow(
      runtime.editorCommands,
      runtime.selection,
      {
        onCollision: undefined,
        onMarkerCollision(request): void {
          markerRequest = request;
        },
        onTransactionRejected(error): void {
          throw error;
        },
        onSelectionChanged: undefined,
      },
    );

    expect(workflow.commitMove([], 240)).toBe("collision");
    const currentMarkerRequest = markerRequest as
      MarkerCollisionResolutionRequest | null;

    if (currentMarkerRequest === null) {
      throw new Error("The marker collision request is missing.");
    }

    currentMarkerRequest.onOverwrite();

    expect(activeMarkerTicks(runtime, "tempo")).not.toContain(960);
    expect(activeMarkerTicks(runtime, "tempo")).toContain(1_200);
  });

  test("resolves note then marker collisions before one mixed commit", () => {
    const sourceNote = createTestNote({
      id: "moving-note",
      startTick: 960,
      durationTicks: 240,
      pitch: 60,
    });
    const occupiedNote = createTestNote({
      id: "occupied-note",
      startTick: 1_200,
      durationTicks: 240,
      pitch: 60,
    });
    const state = createProjectWithTempoCollision([
      sourceNote,
      occupiedNote,
    ]);
    const runtime = createEditorRuntime(state);
    const markerGroup = createSelectedMarkerGroup(960, true, false);
    let noteRequest: NoteCollisionResolutionRequest | null = null;
    let markerRequest: MarkerCollisionResolutionRequest | null = null;

    expect(markerGroup).not.toBeNull();
    runtime.selection.add(sourceNote);
    runtime.selection.addMarkerGroup(markerGroup!);
    const workflow = new NoteGestureWorkflow(
      runtime.editorCommands,
      runtime.selection,
      {
        onCollision(request): void {
          noteRequest = request;
        },
        onMarkerCollision(request): void {
          markerRequest = request;
        },
        onTransactionRejected(error): void {
          throw error;
        },
        onSelectionChanged: undefined,
      },
    );
    const proposedNote = { ...sourceNote, startTick: 1_200 };

    expect(workflow.commitMove([proposedNote], 240)).toBe("collision");
    expect(noteRequest).not.toBeNull();
    expect(markerRequest).toBeNull();
    expect(activeMarkerTicks(runtime, "tempo")).toContain(960);

    const currentNoteRequest = noteRequest as
      NoteCollisionResolutionRequest | null;

    if (currentNoteRequest === null) {
      throw new Error("The note collision request is missing.");
    }

    const notePlan = createNoteCollisionResolutionPlan(
      runtime.projectStore.getState(),
      TEST_CLIP_ID,
      {
        originalNotes: currentNoteRequest.originalNotes,
        proposedNotes: currentNoteRequest.proposedNotes,
      },
      "merge",
      "mixed-marker-test",
    );

    currentNoteRequest.onResolutionPrepared?.({
      commands: notePlan.commands,
      selectedNoteIds: notePlan.resultingSelectionNoteIds,
      transactionLabel: "Move timeline selection: merge collisions",
    });

    expect(markerRequest).not.toBeNull();
    expect(activeMarkerTicks(runtime, "tempo")).toContain(960);

    const currentMarkerRequest = markerRequest as
      MarkerCollisionResolutionRequest | null;

    if (currentMarkerRequest === null) {
      throw new Error("The marker collision request is missing.");
    }

    currentMarkerRequest.onOverwrite();

    expect(activeMarkerTicks(runtime, "tempo")).not.toContain(960);
    expect(activeMarkerTicks(runtime, "tempo")).toContain(1_200);
    expect(runtime.selection.markerGroups).toEqual([{
      startTick: 1_200,
      kinds: ["tempo"],
    }]);
  });
});

function createProjectWithTempoCollision(
  notes = [createTestNote({ id: "unused", startTick: 8_000 })],
): EditorSessionState {
  const state = createTestProject({
    clips: [{ id: TEST_CLIP_ID, notes }],
  });
  const clip = getActiveClip(state);

  return withTimeMap(state, {
    ...clip.timeline.timeMap,
    tempoMarkers: [
      clip.timeline.timeMap.tempoMarkers[0]!,
      { startTick: 960, bpm: 90 },
      { startTick: 1_200, bpm: 110 },
    ],
  });
}

function createProjectWithMixedFlag(
  note = createTestNote({ id: "unused-note", startTick: 8_000 }),
): EditorSessionState {
  const state = createTestProject({
    clips: [{ id: TEST_CLIP_ID, notes: [note] }],
  });
  const clip = getActiveClip(state);

  return withTimeMap(state, {
    meterMarkers: [
      clip.timeline.timeMap.meterMarkers[0]!,
      {
        startTick: MIXED_MARKER_TICK,
        timeSignature: { numerator: 3, denominator: 4 },
      },
    ],
    tempoMarkers: [
      clip.timeline.timeMap.tempoMarkers[0]!,
      { startTick: MIXED_MARKER_TICK, bpm: 90 },
    ],
    scaleMarkers: [
      clip.timeline.timeMap.scaleMarkers[0]!,
      {
        startTick: MIXED_MARKER_TICK,
        rootNote: "D",
        patternType: "scale",
        patternId: "ionian",
      },
    ],
    sectionMarkers: [{
      startTick: MIXED_MARKER_TICK,
      comment: "Verse",
    }],
  });
}

function withTimeMap(state: EditorSessionState, timeMap: TimeMap): EditorSessionState {
  const clip = getActiveClip(state);

  return {
    ...state,
    clipsById: {
      ...state.clipsById,
      [clip.id]: {
        ...clip,
        timeline: { ...clip.timeline, timeMap },
      },
    },
  };
}

function createLassoCompletion(
  originLocalX: number,
  currentLocalX: number,
): GestureCompletion {
  return {
    mode: "LASSO_SELECTING",
    pointerWasTap: false,
    targetNoteId: null,
    deltaTicks: 0,
    deltaPitch: 0,
    getSnapSettingsAtTick: () => ({
      enabled: false,
      visualGuideEnabled: false,
      rootNote: "C",
      patternType: "scale",
        patternId: "ionian",
    }),
    drawStartTick: 0,
    drawPitch: 0,
    drawDurationTicks: 0,
    drawInstrumentId: null,
    originLocalX,
    originLocalY: 20,
    currentLocalX,
    currentLocalY: -30,
    snapResolutionTicks: 240,
    selectionMode: "replace",
  };
}

function activeMarkerTicks(
  runtime: ReturnType<typeof createEditorRuntime>,
  kind: "meter" | "tempo" | "scale" | "section",
): readonly number[] {
  const timeMap = getActiveClip(runtime.projectStore.getState()).timeline.timeMap;

  return kind === "meter"
    ? timeMap.meterMarkers.map((marker) => marker.startTick)
    : kind === "tempo"
      ? timeMap.tempoMarkers.map((marker) => marker.startTick)
      : kind === "scale"
        ? timeMap.scaleMarkers.map((marker) => marker.startTick)
        : timeMap.sectionMarkers.map((marker) => marker.startTick);
}
