import {
  describe,
  expect,
  test,
} from "vitest";
import {
  createEditorRuntime,
} from "../../src/bootstrap/create-app-runtime";
import {
  createDefaultTimeMap,
} from "../../src/domain/transport/time-map";
import {
  getActiveClip,
} from "../../src/domain/project/project-document";
import type {
  GestureCompletion,
} from "../../src/editor-core/interactions/gestures/gesture-state-machine";
import {
  PianoRollInteractionSession,
} from "../../src/editor-core/interactions/piano-roll-interaction-session";
import {
  ViewportController,
  formatElapsedTime,
  formatMusicalPosition,
} from "../../src/editor-core/viewport/viewport-controller";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
} from "../../src/domain/music-theory/pitch-snap";
import {
  NoteGestureWorkflowAdapter,
} from "../../src/presentation/piano-roll/interactions/note-gesture-workflow-adapter";
import {
  PianoRollSelectionController,
} from "../../src/presentation/piano-roll/interactions/piano-roll-selection-controller";
import {
  createTestNote,
  createTestProject,
  TEST_INSTRUMENT_ID,
} from "../support/test-builders";

describe("P3 editor controller contracts", () => {
  test("batches bounded viewport inputs and suspends playback follow", () => {
    const runtime = createEditorRuntime(createTestProject({
      clips: [{ id: "clip-a", measureCount: 16 }],
    }));
    const controller = new ViewportController(runtime);

    controller.updateDimensions(800, 650);
    controller.queueHorizontalZoom(2);
    controller.queueVerticalZoom(1.5);

    expect(controller.hasPendingInputs()).toBe(true);

    const flushed = controller.flushPendingInputs();

    expect(controller.hasPendingInputs()).toBe(false);
    expect(flushed.viewport.zoomX).toBe(2);
    expect(flushed.viewport.zoomY).toBe(1.5);
    expect(flushed.maximumHorizontalScroll).toBeGreaterThan(0);

    controller.setFollowPlayback(true);
    controller.beginHorizontalInteraction();
    runtime.playheadTick.set(10_000);

    expect(controller.followPlayhead().viewport.scrollX).toBe(
      flushed.viewport.scrollX,
    );
    expect(controller.endHorizontalInteraction().viewport.scrollX)
      .toBeGreaterThan(flushed.viewport.scrollX);
  });

  test("does not reveal the playhead when playback follow is disabled", () => {
    const runtime = createEditorRuntime(createTestProject({
      clips: [{ id: "clip-a", measureCount: 16 }],
    }));
    const controller = new ViewportController(runtime);

    controller.updateDimensions(800, 650);
    controller.queueHorizontalZoom(2);
    controller.flushPendingInputs();
    controller.queueHorizontalScroll(1_000);
    const navigated = controller.flushPendingInputs();

    runtime.playheadTick.set(0);
    controller.setFollowPlayback(false);

    expect(navigated.viewport.scrollX).toBeGreaterThan(0);
    expect(controller.followPlayhead().viewport.scrollX).toBe(
      navigated.viewport.scrollX,
    );
  });

  test("formats timeline status independently from DOM outputs", () => {
    const timeMap = createDefaultTimeMap();

    expect(formatMusicalPosition(
      3_960,
      960,
      { durationTicks: 7_680, timeMap },
      120,
    )).toBe("2.1.2");
    expect(formatElapsedTime(3_840, 480, timeMap)).toBe("00:00:04");
  });

  test("exposes selection through an imperative controller", () => {
    const note = createTestNote({ id: "selected-note", pitch: 64 });
    const runtime = createEditorRuntime(createTestProject({
      clips: [{ id: "clip-a", notes: [note] }],
    }));
    const session = new PianoRollInteractionSession(
      runtime.viewport.get(),
      runtime.viewport.version,
    );
    const publishedSelectionSizes: number[] = [];
    const controller = new PianoRollSelectionController({
      session,
      viewport: runtime.viewport,
      editorCommands: runtime.editorCommands,
      getVisuals: () => null,
      onSelectionChange: (hasSelection) => {
        publishedSelectionSizes.push(hasSelection ? 1 : 0);
      },
    });

    controller.replaceSelection([note]);

    expect(controller.getSelectedNotes()).toEqual([note]);

    expect(publishedSelectionSizes).toEqual([1]);
  });

  test("selects every note in the active clip through one request", () => {
    const secondInstrumentId = "instrument-b";
    const firstNote = createTestNote({ id: "first-note" });
    const secondNote = createTestNote({
      id: "second-note",
      instrumentId: secondInstrumentId,
      pitch: 67,
    });
    const runtime = createEditorRuntime(createTestProject({
      instrumentIds: [TEST_INSTRUMENT_ID, secondInstrumentId],
      clips: [{ id: "clip-a", notes: [firstNote, secondNote] }],
    }));
    const session = new PianoRollInteractionSession(
      runtime.viewport.get(),
      runtime.viewport.version,
    );
    const controller = new PianoRollSelectionController({
      session,
      viewport: runtime.viewport,
      editorCommands: runtime.editorCommands,
      getVisuals: () => null,
      onSelectionChange: undefined,
    });

    controller.handleRequest({ type: "selectAllNotes" });

    expect(controller.getSelectedNotes()).toEqual([firstNote, secondNote]);
  });

  test("adapts a completed move into the note workflow", () => {
    const note = createTestNote({ id: "moving-note", startTick: 0 });
    const runtime = createEditorRuntime(createTestProject({
      clips: [{ id: "clip-a", notes: [note] }],
    }));
    const session = new PianoRollInteractionSession(
      runtime.viewport.get(),
      runtime.viewport.version,
    );

    session.selection.add(note);
    const adapter = new NoteGestureWorkflowAdapter({
      editorCommands: runtime.editorCommands,
      selection: session.selection,
      onSelectionChanged: () => undefined,
      onCollision: undefined,
      onTransactionRejected: undefined,
    });

    adapter.commitMove(createCompletion({ deltaTicks: 240 }));

    expect(
      getActiveClip(runtime.projectStore.getState())
        .tracksByInstrumentId[TEST_INSTRUMENT_ID]
        ?.notesById[note.id]?.startTick,
    ).toBe(240);
  });
});

function createCompletion(
  changes: Partial<GestureCompletion>,
): GestureCompletion {
  return {
    mode: "DRAGGING",
    pointerWasTap: false,
    targetNoteId: null,
    deltaTicks: 0,
    deltaPitch: 0,
    getSnapSettingsAtTick: () => DEFAULT_PITCH_SNAP_SETTINGS,
    drawStartTick: 0,
    drawPitch: 60,
    drawDurationTicks: 120,
    drawInstrumentId: null,
    originLocalX: 0,
    originLocalY: 0,
    currentLocalX: 0,
    currentLocalY: 0,
    snapResolutionTicks: 120,
    selectionMode: "replace",
    ...changes,
  };
}
