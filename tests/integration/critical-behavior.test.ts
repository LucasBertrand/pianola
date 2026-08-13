import {
  describe,
  expect,
  test,
} from "vitest";
import {
  compilePlaybackPlan,
} from "../../src/audio/playback-snapshot";
import {
  createClipPlaybackSource,
} from "../../src/audio/playback-source";
import {
  LookaheadScheduler,
} from "../../src/audio/lookahead-scheduler";
import {
  createEditorRuntime,
} from "../../src/app/create-app-runtime";
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
} from "../../src/domain/project-store";
import {
  CRITICAL_BEHAVIOR_EXPECTATION,
  createCriticalBehaviorProject,
  SECOND_TEST_CLIP_ID,
} from "../support/project-fixtures";
import {
  FakeAudioEngine,
  FakeSchedulerTimer,
} from "../support/fake-audio-engine";
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

  test("launches playback with the expected deterministic audio plan", async () => {
    const project = createCriticalBehaviorProject();
    const snapshot = compilePlaybackPlan(
      project,
      createClipPlaybackSource(getActiveClip(project)),
    );
    const engine = new FakeAudioEngine({
      scheduleAheadSeconds: 0.6,
    });
    const timer = new FakeSchedulerTimer();
    const scheduler = new LookaheadScheduler(
      engine,
      snapshot,
      getActiveClip(project).transportSettings,
      {},
      timer,
      0,
    );

    await scheduler.play();

    expect(engine.resumeCount).toBe(1);
    expect(engine.events.map((event) => ({
      noteId: event.instrument.noteIds.find((noteId) =>
        event.occurrenceId.endsWith(`:${noteId}`)),
      pitch: event.pitch,
      startAudioTimeSeconds: event.startAudioTimeSeconds,
      endAudioTimeSeconds: event.endAudioTimeSeconds,
    }))).toEqual([
      {
        noteId: "existing-note",
        pitch: 60,
        startAudioTimeSeconds: 0.012,
        endAudioTimeSeconds: 0.0745,
      },
      {
        noteId: "scheduled-note",
        pitch: 67,
        startAudioTimeSeconds: 0.262,
        endAudioTimeSeconds: 0.387,
      },
    ]);
    expect(timer.pendingCount).toBe(1);

    await scheduler.dispose();
    expect(engine.disposed).toBe(true);
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

  test("restores each clip playhead while navigation stays outside undo", () => {
    const runtime = createEditorRuntime(createCriticalBehaviorProject());

    runtime.playheadTick.set(640);
    runtime.editorCommands.selectClip(SECOND_TEST_CLIP_ID);
    runtime.playheadTick.set(1_280);
    runtime.editorCommands.selectClip(TEST_CLIP_ID);

    expect(runtime.playheadTick.get()).toBe(640);
    expect(runtime.projectStore.canUndo()).toBe(false);

    runtime.editorCommands.selectClip(SECOND_TEST_CLIP_ID);

    expect(runtime.playheadTick.get()).toBe(1_280);
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
