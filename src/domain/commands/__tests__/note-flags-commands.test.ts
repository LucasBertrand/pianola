import { describe, expect, test } from "vitest";
import {
  createTestNote,
  createTestProject,
  TEST_CLIP_ID,
  TEST_INSTRUMENT_ID,
} from "../../../../tests/support/test-builders";
import { compilePlaybackPlan } from "../../../audio/playback-snapshot";
import { ProjectStore } from "../../../application/history/project-store";
import { CommandRejectedError } from "../command-errors";

describe("note mute and lock commands", () => {
  test("updates playback and editability independently", () => {
    const note = createTestNote({ id: "note-flags" });
    const store = new ProjectStore(createTestProject({
      clips: [{ id: TEST_CLIP_ID, notes: [note] }],
    }));

    setLocked(store, true, 1);
    expect(getNoteFlags(store)).toEqual({ muted: false, locked: true });
    expect(getPlaybackNoteIds(store)).toEqual([note.id]);
    expect(() => moveNote(store, 2)).toThrowError(
      expect.objectContaining<Partial<CommandRejectedError>>({
        code: "NOTE_LOCKED",
      }),
    );

    setMuted(store, true, 3);
    expect(getNoteFlags(store)).toEqual({ muted: true, locked: true });
    expect(getPlaybackNoteIds(store)).toEqual([]);
    expect(() => moveNote(store, 4)).toThrowError(
      expect.objectContaining<Partial<CommandRejectedError>>({
        code: "NOTE_LOCKED",
      }),
    );

    setLocked(store, false, 5);
    expect(getPlaybackNoteIds(store)).toEqual([]);
    expect(() => moveNote(store, 6)).not.toThrow();
    expect(getNoteFlags(store)).toEqual({ muted: true, locked: false });

    setMuted(store, false, 7);
    expect(getPlaybackNoteIds(store)).toEqual([note.id]);
    expect(getNoteFlags(store)).toEqual({ muted: false, locked: false });
  });
});

function setMuted(
  store: ProjectStore,
  muted: boolean,
  createdAt: number,
): void {
  store.dispatch({
    transactionId: `muted-${String(muted)}-${String(createdAt)}`,
    createdAt,
    commands: [{
      type: "SetNotesMuted",
      clipId: TEST_CLIP_ID,
      trackInstrumentId: TEST_INSTRUMENT_ID,
      noteIds: ["note-flags"],
      muted,
    }],
  });
}

function setLocked(
  store: ProjectStore,
  locked: boolean,
  createdAt: number,
): void {
  store.dispatch({
    transactionId: `locked-${String(locked)}-${String(createdAt)}`,
    createdAt,
    commands: [{
      type: "SetNotesLocked",
      clipId: TEST_CLIP_ID,
      trackInstrumentId: TEST_INSTRUMENT_ID,
      noteIds: ["note-flags"],
      locked,
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
      changes: [{ noteId: "note-flags", startTick: 240, pitch: 60 }],
    }],
  });
}

function getNoteFlags(store: ProjectStore) {
  const note = store.getState().clipsById[TEST_CLIP_ID]!
    .tracksByInstrumentId[TEST_INSTRUMENT_ID]!
    .notesById["note-flags"]!;

  return { muted: note.muted, locked: note.locked };
}

function getPlaybackNoteIds(store: ProjectStore): readonly string[] {
  return compilePlaybackPlan(store.getState(), {
    kind: "clip",
    sourceId: TEST_CLIP_ID,
    clip: store.getState().clipsById[TEST_CLIP_ID]!,
  }).instruments[0]!.noteIds;
}
