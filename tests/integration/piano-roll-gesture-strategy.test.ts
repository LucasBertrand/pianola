import { describe, expect, test, vi } from "vitest";
import {
  createEditorRuntime,
} from "../../src/app/create-app-runtime";
import {
  getActiveClip,
} from "../../src/domain/project/project-document";
import {
  PianoRollInteractionSession,
} from "../../src/editor/interactions/piano-roll-interaction-session";
import type {
  PointerSample,
} from "../../src/editor/interactions/pointer/pointer-sample";
import {
  NoteGestureWorkflowAdapter,
} from "../../src/ui/piano-roll/interactions/note-gesture-workflow-adapter";
import {
  createPianoRollGestureStrategy,
} from "../../src/ui/piano-roll/interactions/piano-roll-gesture-strategy";
import type {
  InteractionVisualController,
} from "../../src/ui/piano-roll/interactions/interaction-visual-controller";
import {
  PianoRollSelectionController,
} from "../../src/ui/piano-roll/interactions/piano-roll-selection-controller";
import {
  createTestNote,
  createTestProject,
  TEST_CLIP_ID,
  TEST_INSTRUMENT_ID,
} from "../support/test-builders";

function createPointerSample(changes: Partial<PointerSample>): PointerSample {
  return {
    pointerId: 1,
    pointerType: "mouse",
    clientX: 0,
    clientY: 0,
    button: 0,
    timeStamp: 0,
    shiftKey: false,
    ...changes,
  };
}

describe("PianoRollGestureStrategy pitch highlight during selection drag", () => {
  test("selects a disabled note without starting an edit gesture", () => {
    const disabledNote = createTestNote({
      id: "disabled-note",
      pitch: 64,
      startTick: 480,
      durationTicks: 480,
      muted: true,
      locked: true,
    });
    const runtime = createEditorRuntime(createTestProject({
      clips: [{ id: TEST_CLIP_ID, notes: [disabledNote] }],
    }));
    const session = new PianoRollInteractionSession(
      runtime.viewport.get(),
      runtime.viewport.version,
      runtime.selection,
    );
    const selectionController = new PianoRollSelectionController({
      session,
      viewport: runtime.viewport,
      editorCommands: runtime.editorCommands,
      getVisuals: () => null,
      onSelectionChange: () => undefined,
    });
    const workflow = new NoteGestureWorkflowAdapter({
      editorCommands: runtime.editorCommands,
      selection: session.selection,
      onSelectionChanged: () => undefined,
      onCollision: undefined,
      onTransactionRejected: undefined,
    });
    const overlay = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 1000,
        bottom: 800,
        width: 1000,
        height: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    } as unknown as HTMLElement;
    const strategy = createPianoRollGestureStrategy({
      overlay,
      getVisuals: () => null,
      session,
      viewport: runtime.viewport,
      selectionController,
      workflow,
      spatialIndex: runtime.spatialIndex,
      instrumentStyles: runtime.instrumentStyles,
      editorCommands: runtime.editorCommands,
      getActiveInstrumentId: () => TEST_INSTRUMENT_ID,
      getInstrumentOrder: () => [TEST_INSTRUMENT_ID],
      totalTicks: 7680,
      selectionMode: "replace",
      gridResolutionTicks: runtime.gridResolutionTicks,
      pitchSnapSettings: runtime.pitchSnapSettings,
      onGridSeek: undefined,
      onPitchHighlightChange: undefined,
    });
    const pointer = createPointerSample({
      clientX: session.converter.tickToCssPixelX(720),
      clientY: session.converter.pitchToCssPixelY(64) + 5,
    });

    strategy.onPointerDown(pointer);
    strategy.onPointerUp(pointer);

    expect(runtime.selection.notes.map((note) => note.id)).toEqual([
      disabledNote.id,
    ]);
    expect(getActiveClip(runtime.projectStore.getState())
      .tracksByInstrumentId[TEST_INSTRUMENT_ID]
      ?.notesById[disabledNote.id]).toEqual(disabledNote);
  });

  test("publishes handled note pitch on pointerDown, updates on drag move, and clears on pointerUp", () => {
    const noteA = createTestNote({
      id: "note-a",
      pitch: 64,
      startTick: 480,
      durationTicks: 480,
    });
    const runtime = createEditorRuntime(createTestProject({
      clips: [{ id: "clip-a", notes: [noteA] }],
    }));

    const session = new PianoRollInteractionSession(
      runtime.viewport.get(),
      runtime.viewport.version,
    );

    const selectionController = new PianoRollSelectionController({
      session,
      viewport: runtime.viewport,
      editorCommands: runtime.editorCommands,
      getVisuals: () => null,
      onSelectionChange: () => undefined,
    });

    const workflow = new NoteGestureWorkflowAdapter({
      editorCommands: runtime.editorCommands,
      selection: session.selection,
      onSelectionChanged: () => undefined,
      onCollision: undefined,
      onTransactionRejected: undefined,
    });

    const publishedPitches: Array<number | null> = [];

    const overlay = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 1000,
        bottom: 800,
        width: 1000,
        height: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    } as unknown as HTMLElement;

    const strategy = createPianoRollGestureStrategy({
      overlay,
      getVisuals: () => null,
      session,
      viewport: runtime.viewport,
      selectionController,
      workflow,
      spatialIndex: runtime.spatialIndex,
      instrumentStyles: runtime.instrumentStyles,
      editorCommands: runtime.editorCommands,
      getActiveInstrumentId: () => TEST_INSTRUMENT_ID,
      getInstrumentOrder: () => [TEST_INSTRUMENT_ID],
      totalTicks: 7680,
      selectionMode: "replace",
      gridResolutionTicks: runtime.gridResolutionTicks,
      pitchSnapSettings: runtime.pitchSnapSettings,
      onGridSeek: undefined,
      onPitchHighlightChange: (pitch) => {
        publishedPitches.push(pitch);
      },
    });

    const converter = session.converter;
    // Calculate clientX and clientY for noteA (center of note at tick 480 + 240, pitch: 64)
    const noteX = converter.tickToCssPixelX(480 + 240);
    const noteY = converter.pitchToCssPixelY(64) + 5;

    // Pointer down on note A
    strategy.onPointerDown(createPointerSample({
      pointerId: 1,
      clientX: noteX,
      clientY: noteY,
    }));

    // Should publish the handled note's base pitch (64)
    expect(publishedPitches).toEqual([64]);

    // Drag up by 2 semitones (pitch 66)
    const newY = converter.pitchToCssPixelY(66) + 5;
    strategy.onPointerMove(createPointerSample({
      pointerId: 1,
      clientX: noteX + 20,
      clientY: newY,
    }));

    expect(publishedPitches).toEqual([64, 66]);

    // Pointer up completes the drag
    strategy.onPointerUp(createPointerSample({
      pointerId: 1,
      clientX: noteX + 20,
      clientY: newY,
    }));

    // Should clear the highlight
    expect(publishedPitches).toEqual([64, 66, null]);
  });

  test("uses the cursor-handled note as reference in multi-note selection", () => {
    const noteA = createTestNote({
      id: "note-a",
      pitch: 60,
      startTick: 0,
      durationTicks: 480,
    });
    const noteB = createTestNote({
      id: "note-b",
      pitch: 72,
      startTick: 960,
      durationTicks: 480,
    });

    const runtime = createEditorRuntime(createTestProject({
      clips: [{ id: "clip-a", notes: [noteA, noteB] }],
    }));

    const session = new PianoRollInteractionSession(
      runtime.viewport.get(),
      runtime.viewport.version,
    );

    const selectionController = new PianoRollSelectionController({
      session,
      viewport: runtime.viewport,
      editorCommands: runtime.editorCommands,
      getVisuals: () => null,
      onSelectionChange: () => undefined,
    });

    // Pre-select both notes
    selectionController.replaceSelection([noteA, noteB]);

    const workflow = new NoteGestureWorkflowAdapter({
      editorCommands: runtime.editorCommands,
      selection: session.selection,
      onSelectionChanged: () => undefined,
      onCollision: undefined,
      onTransactionRejected: undefined,
    });

    const publishedPitches: Array<number | null> = [];

    const overlay = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 1000,
        bottom: 800,
        width: 1000,
        height: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    } as unknown as HTMLElement;

    const strategy = createPianoRollGestureStrategy({
      overlay,
      getVisuals: () => null,
      session,
      viewport: runtime.viewport,
      selectionController,
      workflow,
      spatialIndex: runtime.spatialIndex,
      instrumentStyles: runtime.instrumentStyles,
      editorCommands: runtime.editorCommands,
      getActiveInstrumentId: () => TEST_INSTRUMENT_ID,
      getInstrumentOrder: () => [TEST_INSTRUMENT_ID],
      totalTicks: 7680,
      selectionMode: "replace",
      gridResolutionTicks: runtime.gridResolutionTicks,
      pitchSnapSettings: runtime.pitchSnapSettings,
      onGridSeek: undefined,
      onPitchHighlightChange: (pitch) => {
        publishedPitches.push(pitch);
      },
    });

    const converter = session.converter;
    // Click on note B (pitch 72, center of note at tick 960 + 240)
    const noteBX = converter.tickToCssPixelX(960 + 240);
    const noteBY = converter.pitchToCssPixelY(72) + 5;

    strategy.onPointerDown(createPointerSample({
      pointerId: 1,
      clientX: noteBX,
      clientY: noteBY,
    }));

    // Handled note is noteB (pitch 72)
    expect(publishedPitches).toEqual([72]);

    // Move down 3 semitones (pitch 69 for noteB, noteA becomes 57)
    const newY = converter.pitchToCssPixelY(69) + 5;
    strategy.onPointerMove(createPointerSample({
      pointerId: 1,
      clientX: noteBX,
      clientY: newY,
    }));

    expect(publishedPitches).toEqual([72, 69]);

    // Cancel gesture
    strategy.cancel();

    expect(publishedPitches).toEqual([72, 69, null]);
  });
});

describe("PianoRollGestureStrategy draw selection history", () => {
  test("hides the previous selection without clearing it before draw commit", () => {
    const noteA = createTestNote({
      id: "note-a",
      pitch: 60,
      startTick: 0,
      durationTicks: 480,
    });
    const runtime = createEditorRuntime(createTestProject({
      clips: [{ id: "clip-a", notes: [noteA] }],
    }));
    const session = new PianoRollInteractionSession(
      runtime.viewport.get(),
      runtime.viewport.version,
      runtime.selection,
    );
    const visuals = createVisualControllerSpy();
    const selectionController = new PianoRollSelectionController({
      session,
      viewport: runtime.viewport,
      editorCommands: runtime.editorCommands,
      getVisuals: () => visuals,
      onSelectionChange: () => undefined,
    });
    const workflow = new NoteGestureWorkflowAdapter({
      editorCommands: runtime.editorCommands,
      selection: session.selection,
      onSelectionChanged: () => undefined,
      onCollision: undefined,
      onTransactionRejected: undefined,
    });
    const overlay = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 1000,
        bottom: 800,
        width: 1000,
        height: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    } as unknown as HTMLElement;
    const strategy = createPianoRollGestureStrategy({
      overlay,
      getVisuals: () => visuals,
      session,
      viewport: runtime.viewport,
      selectionController,
      workflow,
      spatialIndex: runtime.spatialIndex,
      instrumentStyles: runtime.instrumentStyles,
      editorCommands: runtime.editorCommands,
      getActiveInstrumentId: () => TEST_INSTRUMENT_ID,
      getInstrumentOrder: () => [TEST_INSTRUMENT_ID],
      totalTicks: 7680,
      selectionMode: "replace",
      gridResolutionTicks: runtime.gridResolutionTicks,
      pitchSnapSettings: runtime.pitchSnapSettings,
      onGridSeek: undefined,
      onPitchHighlightChange: undefined,
    });

    selectionController.replaceSelection([noteA]);
    const drawEvent = createPointerSample({
      pointerId: 2,
      pointerType: "touch",
      clientX: session.converter.tickToCssPixelX(960),
      clientY: session.converter.pitchToCssPixelY(72) + 5,
    });

    strategy.onPointerDown(drawEvent);
    strategy.cancel();
    strategy.onLongPress(drawEvent);

    expect(visuals.clearSelection).toHaveBeenCalledOnce();
    expect(session.selection.notes.map((note) => note.id)).toEqual([noteA.id]);

    strategy.onPointerUp(drawEvent);
    expect(session.selection.notes).toHaveLength(1);
    expect(session.selection.notes[0]?.id).not.toBe(noteA.id);

    runtime.editorCommands.undo();
    expect(session.selection.notes.map((note) => note.id)).toEqual([noteA.id]);
  });
});

describe("PianoRollGestureStrategy ruler lasso", () => {
  test("starts above the grid and selects a marker through one global lasso", () => {
    const baseState = createTestProject();
    const baseClip = getActiveClip(baseState);
    const markerTick = 960;
    const state = {
      ...baseState,
      clipsById: {
        ...baseState.clipsById,
        [TEST_CLIP_ID]: {
          ...baseClip,
          timeline: {
            ...baseClip.timeline,
            timeMap: {
              ...baseClip.timeline.timeMap,
              tempoMarkers: [
                ...baseClip.timeline.timeMap.tempoMarkers,
                { startTick: markerTick, bpm: 90 },
              ],
            },
          },
        },
      },
    };
    const runtime = createEditorRuntime(state);
    const session = new PianoRollInteractionSession(
      runtime.viewport.get(),
      runtime.viewport.version,
      runtime.selection,
    );
    const visuals = createVisualControllerSpy();
    const selectionController = new PianoRollSelectionController({
      session,
      viewport: runtime.viewport,
      editorCommands: runtime.editorCommands,
      getVisuals: () => visuals,
      onSelectionChange: () => undefined,
    });
    const workflow = new NoteGestureWorkflowAdapter({
      editorCommands: runtime.editorCommands,
      selection: session.selection,
      onSelectionChanged: () => undefined,
      onCollision: undefined,
      onTransactionRejected: undefined,
    });
    const overlay = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 50,
        right: 1000,
        bottom: 850,
        width: 1000,
        height: 800,
        x: 0,
        y: 50,
        toJSON: () => ({}),
      }),
    } as unknown as HTMLElement;
    const soughtTicks: number[] = [];
    const strategy = createPianoRollGestureStrategy({
      overlay,
      getVisuals: () => visuals,
      session,
      viewport: runtime.viewport,
      selectionController,
      workflow,
      spatialIndex: runtime.spatialIndex,
      instrumentStyles: runtime.instrumentStyles,
      editorCommands: runtime.editorCommands,
      getActiveInstrumentId: () => TEST_INSTRUMENT_ID,
      getInstrumentOrder: () => [TEST_INSTRUMENT_ID],
      totalTicks: baseClip.timeline.durationTicks,
      selectionMode: "replace",
      gridResolutionTicks: runtime.gridResolutionTicks,
      pitchSnapSettings: runtime.pitchSnapSettings,
      onGridSeek: (tick) => {
        soughtTicks.push(tick);
      },
      onPitchHighlightChange: undefined,
    });
    const startX = session.converter.tickToCssPixelX(0);
    const endX = session.converter.tickToCssPixelX(1_920);

    runtime.selection.addMarkerGroup({
      startTick: markerTick,
      kinds: ["tempo"],
    });
    strategy.onPointerDown(createPointerSample({
      pointerId: 1,
      clientX: startX,
      clientY: 25,
    }));
    strategy.onPointerUp(createPointerSample({
      pointerId: 1,
      clientX: startX,
      clientY: 25,
    }));

    expect(runtime.selection.size).toBe(0);
    expect(soughtTicks).toHaveLength(1);

    strategy.onPointerDown(createPointerSample({
      pointerId: 2,
      clientX: startX,
      clientY: 25,
    }));
    strategy.onPointerMove(createPointerSample({
      pointerId: 2,
      clientX: endX,
      clientY: 100,
    }));
    strategy.onPointerUp(createPointerSample({
      pointerId: 2,
      clientX: endX,
      clientY: 100,
    }));

    expect(visuals.beginLasso).toHaveBeenCalledWith(startX, -25);
    expect(runtime.selection.markerGroups).toEqual([{
      startTick: markerTick,
      kinds: ["tempo"],
    }]);
    expect(visuals.endLasso).toHaveBeenCalledOnce();
  });
});

function createVisualControllerSpy(): InteractionVisualController {
  return {
    beginDrag: vi.fn(),
    updateDrag: vi.fn(),
    endDrag: vi.fn(),
    beginResize: vi.fn(),
    updateResize: vi.fn(),
    endResize: vi.fn(),
    beginDraw: vi.fn(),
    updateDraw: vi.fn(),
    endDraw: vi.fn(),
    beginLasso: vi.fn(),
    updateLasso: vi.fn(),
    endLasso: vi.fn(),
    showSelection: vi.fn(),
    clearSelection: vi.fn(),
  };
}
