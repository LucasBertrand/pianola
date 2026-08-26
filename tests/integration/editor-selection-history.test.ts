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
  test("edits only eligible notes while retaining a mixed selection", () => {
    const activeNote = createTestNote({
      id: "active-note",
      startTick: 0,
      muted: false,
      locked: false,
    });
    const disabledNote = createTestNote({
      id: "disabled-note",
      startTick: 960,
      muted: true,
      locked: true,
    });
    const runtime = createEditorRuntime(createTestProject({
      clips: [{ id: TEST_CLIP_ID, notes: [activeNote, disabledNote] }],
    }));
    const workflow = new NoteGestureWorkflow(
      runtime.editorCommands,
      runtime.selection,
      {
        onCollision: undefined,
        onTransactionRejected: undefined,
        onSelectionChanged: undefined,
      },
    );

    runtime.selection.replace([activeNote, disabledNote]);

    expect(workflow.commitMove([
      { ...activeNote, startTick: 240 },
      { ...disabledNote, startTick: 1_200 },
    ], 240)).toBe("committed");
    expect(activeNoteById(runtime, activeNote.id)?.startTick).toBe(240);
    expect(activeNoteById(runtime, disabledNote.id)?.startTick).toBe(960);
    expect(selectedNoteIds(runtime)).toEqual([
      activeNote.id,
      disabledNote.id,
    ]);

    expect(workflow.commitDelete(
      runtime.selection.notes,
      "Delete selected notes",
    )).toBe("committed");
    expect(activeNoteById(runtime, activeNote.id)).toBeUndefined();
    expect(activeNoteById(runtime, disabledNote.id)).toEqual(disabledNote);
    expect(selectedNoteIds(runtime)).toEqual([disabledNote.id]);
  });

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

  test("restores the previous draw selection through undo and redo", () => {
    const notes = [
      createTestNote({ id: "drawn-a", startTick: 0 }),
      createTestNote({ id: "drawn-b", startTick: 240 }),
      createTestNote({ id: "drawn-c", startTick: 480 }),
    ];
    const runtime = createEditorRuntime(createTestProject());
    const workflow = new NoteGestureWorkflow(
      runtime.editorCommands,
      runtime.selection,
      {
        onCollision: undefined,
        onTransactionRejected: undefined,
        onSelectionChanged: undefined,
      },
    );

    for (const note of notes) {
      expect(workflow.commitDraw(note)).toBe("committed");
      expect(selectedNoteIds(runtime)).toEqual([note.id]);
    }

    runtime.editorCommands.undo();
    expect(activeNoteIds(runtime)).toEqual(["drawn-a", "drawn-b"]);
    expect(selectedNoteIds(runtime)).toEqual(["drawn-b"]);

    runtime.editorCommands.undo();
    expect(activeNoteIds(runtime)).toEqual(["drawn-a"]);
    expect(selectedNoteIds(runtime)).toEqual(["drawn-a"]);

    runtime.editorCommands.undo();
    expect(activeNoteIds(runtime)).toEqual([]);
    expect(selectedNoteIds(runtime)).toEqual([]);

    runtime.editorCommands.redo();
    expect(selectedNoteIds(runtime)).toEqual(["drawn-a"]);

    runtime.editorCommands.redo();
    expect(selectedNoteIds(runtime)).toEqual(["drawn-b"]);

    runtime.editorCommands.redo();
    expect(activeNoteIds(runtime)).toEqual(notes.map((note) => note.id));
    expect(selectedNoteIds(runtime)).toEqual(["drawn-c"]);
  });
});

function activeNoteIds(
  runtime: ReturnType<typeof createEditorRuntime>,
): readonly string[] {
  const track = getActiveClip(runtime.projectStore.getState())
    .tracksByInstrumentId[TEST_INSTRUMENT_ID];

  return Object.keys(track?.notesById ?? {}).sort();
}

function activeNoteById(
  runtime: ReturnType<typeof createEditorRuntime>,
  noteId: string,
) {
  return getActiveClip(runtime.projectStore.getState())
    .tracksByInstrumentId[TEST_INSTRUMENT_ID]?.notesById[noteId];
}

function selectedNoteIds(
  runtime: ReturnType<typeof createEditorRuntime>,
): readonly string[] {
  return runtime.selection.notes.map((note) => note.id).sort();
}
