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
} from "../../src/domain/project/project-document";
import {
  NoteGestureWorkflow,
} from "../../src/use-cases/piano-roll/notes/note-gesture-workflow";
import {
  createTestNote,
  createTestProject,
  TEST_CLIP_ID,
  TEST_INSTRUMENT_ID,
} from "../support/test-builders";

describe("editor selection history", () => {
  test("restores a deleted selection on undo and clears it again on redo", () => {
    const firstNote = createTestNote({ id: "first-selected-note" });
    const secondNote = createTestNote({
      id: "second-selected-note",
      startTick: 240,
    });
    const runtime = createEditorRuntime(createTestProject({
      clips: [{ id: TEST_CLIP_ID, notes: [firstNote, secondNote] }],
    }));

    runtime.selection.replace([firstNote, secondNote]);
    const workflow = new NoteGestureWorkflow(
      runtime.editorCommands,
      runtime.selection,
      {
        onCollision: undefined,
        onTransactionRejected: undefined,
        onSelectionChanged: undefined,
      },
    );

    expect(workflow.commitDelete(
      [firstNote, secondNote],
      "Delete selected notes",
    )).toBe("committed");
    expect(selectedNoteIds(runtime)).toEqual([]);

    runtime.editorCommands.undo();

    expect(activeNoteIds(runtime)).toEqual([
      firstNote.id,
      secondNote.id,
    ]);
    expect(selectedNoteIds(runtime)).toEqual([
      firstNote.id,
      secondNote.id,
    ]);

    runtime.editorCommands.redo();

    expect(activeNoteIds(runtime)).toEqual([]);
    expect(selectedNoteIds(runtime)).toEqual([]);

    runtime.editorCommands.undo();

    expect(selectedNoteIds(runtime)).toEqual([
      firstNote.id,
      secondNote.id,
    ]);
  });

  test("redo restores the recorded result instead of a later manual selection", () => {
    const previousNote = createTestNote({ id: "previous-note" });
    const drawnNote = createTestNote({
      id: "drawn-note",
      startTick: 240,
    });
    const runtime = createEditorRuntime(createTestProject({
      clips: [{ id: TEST_CLIP_ID, notes: [previousNote] }],
    }));

    runtime.selection.replace([previousNote]);
    const nextState = runtime.editorCommands.dispatch(
      [{
        type: "AddNotes",
        clipId: TEST_CLIP_ID,
        trackInstrumentId: TEST_INSTRUMENT_ID,
        notes: [drawnNote],
      }],
      "Draw note",
      { clipId: TEST_CLIP_ID, noteIds: [drawnNote.id] },
    );

    expect(nextState).not.toBeNull();
    runtime.selection.replace([previousNote]);
    runtime.editorCommands.undo();

    expect(selectedNoteIds(runtime)).toEqual([previousNote.id]);

    runtime.selection.clear();
    runtime.editorCommands.redo();

    expect(selectedNoteIds(runtime)).toEqual([drawnNote.id]);
  });
});

function activeNoteIds(
  runtime: ReturnType<typeof createEditorRuntime>,
): readonly string[] {
  const track = getActiveClip(runtime.projectStore.getState())
    .tracksByInstrumentId[TEST_INSTRUMENT_ID];

  return Object.keys(track?.notesById ?? {}).sort();
}

function selectedNoteIds(
  runtime: ReturnType<typeof createEditorRuntime>,
): readonly string[] {
  return runtime.selection.notes.map((note) => note.id).sort();
}
