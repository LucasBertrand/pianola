import { describe, expect, test } from "vitest";
import {
  createTestNote,
  createTestProject,
  TEST_CLIP_ID,
  TEST_INSTRUMENT_ID,
} from "../../../../tests/support/test-builders";
import { compilePlaybackPlan } from "../../../audio/playback-snapshot";
import { ProjectStore } from "../../project-store";
import { CommandRejectedError } from "../command-errors";

describe("note status commands", () => {
  test("combines playback and editability in one note-level state", () => {
    const note = createTestNote({ id: "status-note" });
    const store = new ProjectStore(createTestProject({
      clips: [{ id: TEST_CLIP_ID, notes: [note] }],
    }));

    setStatus(store, "locked", 1);
    expect(getNoteStatus(store)).toBe("locked");
    expect(getPlaybackNoteIds(store)).toEqual([note.id]);
    expect(() => moveNote(store, 2)).toThrowError(
      expect.objectContaining<Partial<CommandRejectedError>>({
        code: "NOTE_LOCKED",
      }),
    );

    setStatus(store, "disabled", 3);
    expect(getPlaybackNoteIds(store)).toEqual([]);
    expect(() => moveNote(store, 4)).toThrowError(
      expect.objectContaining<Partial<CommandRejectedError>>({
        code: "NOTE_LOCKED",
      }),
    );

    setStatus(store, "muted", 5);
    expect(getPlaybackNoteIds(store)).toEqual([]);
    expect(() => moveNote(store, 6)).not.toThrow();
    expect(getNoteStatus(store)).toBe("muted");

    setStatus(store, "active", 7);
    expect(getPlaybackNoteIds(store)).toEqual([note.id]);
  });
});

function setStatus(
  store: ProjectStore,
  status: "active" | "muted" | "locked" | "disabled",
  createdAt: number,
): void {
  store.dispatch({
    transactionId: `status-${status}-${String(createdAt)}`,
    createdAt,
    commands: [{
      type: "SetNotesStatus",
      clipId: TEST_CLIP_ID,
      trackInstrumentId: TEST_INSTRUMENT_ID,
      noteIds: ["status-note"],
      status,
    }],
  });
}

function moveNote(store: ProjectStore, createdAt: number): void {
  store.dispatch({
    transactionId: `move-${String(createdAt)}`,
    createdAt,
    commands: [{
      type: "RepositionNotes",
      clipId: TEST_CLIP_ID,
      trackInstrumentId: TEST_INSTRUMENT_ID,
      changes: [{ noteId: "status-note", startTick: 240, pitch: 60 }],
    }],
  });
}

function getNoteStatus(store: ProjectStore) {
  return store.getState().clipsById[TEST_CLIP_ID]!
    .tracksByInstrumentId[TEST_INSTRUMENT_ID]!
    .notesById["status-note"]!.status;
}

function getPlaybackNoteIds(store: ProjectStore): readonly string[] {
  return compilePlaybackPlan(store.getState(), {
    kind: "clip",
    sourceId: TEST_CLIP_ID,
    clip: store.getState().clipsById[TEST_CLIP_ID]!,
  }).instruments[0]!.noteIds;
}
