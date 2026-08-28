import {
  describe,
  expect,
  test,
} from "vitest";
import {
  compilePlaybackPlan,
} from "../../src/infrastructure/audio/playback-snapshot";
import {
  createClipPlaybackSource,
} from "../../src/infrastructure/audio/playback-source";
import {
  WorkletTimelineEngine,
  type TimelineEngineDiagnostic,
} from "../../src/infrastructure/audio/worklet/worklet-timeline-engine";
import {
  createTransferableAudioWorkletTimeline,
} from "../../src/infrastructure/audio/worklet/create-audio-worklet-timeline";
import {
  createEditorRuntime,
} from "../../src/bootstrap/create-app-runtime";
import type {
  PianoRollCommand,
} from "../../src/domain/commands/command-types";
import type { Transaction } from "../../src/domain/commands/transaction";
import {
  createNoteCollisionResolutionPlan,
} from "../../src/domain/note-collision";
import {
  getActiveClip,
} from "../../src/domain/project/project-document";
import {
  ProjectStore,
} from "../../src/application/history/project-store";
import {
  CRITICAL_BEHAVIOR_EXPECTATION,
  createCriticalBehaviorProject,
  SECOND_TEST_CLIP_ID,
} from "../support/project-fixtures";
import {
  createTestNote,
  TEST_CLIP_ID,
  TEST_INSTRUMENT_ID,
} from "../support/test-builders";

describe("P0 critical behavior witnesses", () => {
  test("draws and moves a note as two observable transactions", () => {
    const store = new ProjectStore(createCriticalBehaviorProject());
    const drawnNote = createTestNote({
      id: "drawn-note",
      pitch: 64,
      startTick: 240,
      durationTicks: 120,
      velocity: 96,
    });

    dispatch(store, {
      type: "AddNotes",
      clipId: TEST_CLIP_ID,
      trackInstrumentId: TEST_INSTRUMENT_ID,
      notes: [drawnNote],
    }, 1);
    dispatch(store, {
      type: "RepositionNotes",
      clipId: TEST_CLIP_ID,
      trackInstrumentId: TEST_INSTRUMENT_ID,
      changes: [{
        noteId: drawnNote.id,
        startTick: 360,
        pitch: 64,
      }],
    }, 2);

    expect(activeNotes(store)[drawnNote.id]).toEqual(
      CRITICAL_BEHAVIOR_EXPECTATION.drawnNote,
    );
    expect(store.getState().revision).toBe(2);
  });

  test("resolves a same-pitch collision with a deterministic merge", () => {
    const store = new ProjectStore(createCriticalBehaviorProject());
    const collisionProposal = createTestNote({
      id: "collision-proposal",
      pitch: 60,
      startTick: 60,
      durationTicks: 120,
    });
    const plan = createNoteCollisionResolutionPlan(
      store.getState(),
      TEST_CLIP_ID,
      {
        originalNotes: [],
        proposedNotes: [collisionProposal],
      },
      "merge",
      "p0-witness",
    );

    dispatchMany(store, plan.commands, 1);

    expect(activeNotes(store)["existing-note"]).toBeUndefined();
    expect(activeNotes(store)[collisionProposal.id]).toEqual(
      CRITICAL_BEHAVIOR_EXPECTATION.mergedCollision,
    );
    expect(plan.resultingSelectionNoteIds).toEqual([collisionProposal.id]);
  });

  test("launches playback on the deterministic sample clock", () => {
    const project = createCriticalBehaviorProject();
    const snapshot = compilePlaybackPlan(
      project,
      createClipPlaybackSource(getActiveClip(project)),
    );
    const diagnostics: TimelineEngineDiagnostic[] = [];
    const engine = new WorkletTimelineEngine(48_000, {
      onDiagnostic: (event) => diagnostics.push(event),
    });
    const clip = getActiveClip(project);

    engine.loadTimeline(
      createTransferableAudioWorkletTimeline(snapshot).timeline,
      clip.transportSettings,
    );
    engine.play(0);
    engine.process(
      new Float32Array(13_000),
      new Float32Array(13_000),
    );

    expect(diagnostics.filter((event) => event.type === "note-start"))
      .toEqual([
      {
        type: "note-start",
        frame: 0,
        tick: 0,
        instrumentId: TEST_INSTRUMENT_ID,
        pitch: 60,
      },
      {
        type: "note-start",
        frame: 12_000,
        tick: 480,
        instrumentId: TEST_INSTRUMENT_ID,
        pitch: 67,
      },
    ]);
  });

  test("compiles the explicit playback source instead of the active clip", () => {
    const project = createCriticalBehaviorProject();
    const secondClip = project.clipsById[SECOND_TEST_CLIP_ID];

    expect(secondClip).toBeDefined();

    if (secondClip === undefined) {
      return;
    }

    const snapshot = compilePlaybackPlan(
      project,
      createClipPlaybackSource(secondClip),
    );

    expect(project.workspace.activeClipId).toBe(TEST_CLIP_ID);
    expect(snapshot.durationTicks).toBe(7_680);
    expect(snapshot.instruments[0]?.noteIds).toEqual([]);
  });

  test("keeps one playhead independent from clip selection and undo", () => {
    const runtime = createEditorRuntime(createCriticalBehaviorProject());

    runtime.playheadTick.set(640);
    expect(runtime.playheadPosition.get()).toEqual({
      clipId: TEST_CLIP_ID,
      tick: 640,
    });

    runtime.editorCommands.selectClip(SECOND_TEST_CLIP_ID);
    expect(runtime.playheadPosition.get()).toEqual({
      clipId: TEST_CLIP_ID,
      tick: 640,
    });

    runtime.playheadTick.set(1_280);
    expect(runtime.playheadPosition.get()).toEqual({
      clipId: SECOND_TEST_CLIP_ID,
      tick: 1_280,
    });

    runtime.editorCommands.selectClip(TEST_CLIP_ID);
    expect(runtime.playheadPosition.get()).toEqual({
      clipId: SECOND_TEST_CLIP_ID,
      tick: 1_280,
    });
    expect(runtime.playheadTick.get()).toBe(0);
    expect(runtime.projectStore.canUndo()).toBe(false);
  });
});

function activeNotes(store: ProjectStore) {
  return getActiveClip(store.getState())
    .tracksByInstrumentId[TEST_INSTRUMENT_ID]?.notesById ?? {};
}

function dispatch(
  store: ProjectStore,
  command: PianoRollCommand,
  sequence: number,
): void {
  dispatchMany(store, [command], sequence);
}

function dispatchMany(
  store: ProjectStore,
  commands: readonly PianoRollCommand[],
  sequence: number,
): void {
  const transaction: Transaction = {
    transactionId: `p0-witness-${sequence}`,
    label: "P0 behavior witness",
    createdAt: sequence,
    commands,
  };

  store.dispatch(transaction);
}
