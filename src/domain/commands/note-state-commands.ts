import {
  type Note,
} from "../notes/note";
import {
  type NoteId,
} from "../identifiers";
import type { ActiveClipProjectState } from "./active-clip-project-state";
import type {
  DeleteNotesCommand,
  SetNotesEnabledCommand,
} from "./command-types";
import {
  replaceTrack,
} from "./active-clip-command-helpers";
import {
  assertProjectInstrumentEditable,
  assertUniqueNoteIds,
  reject,
  requireNote,
  requireTrack,
} from "./command-context";

export function applyDeleteNotes(
  state: ActiveClipProjectState,
  command: DeleteNotesCommand,
): ActiveClipProjectState {
  const track = requireTrack(state, command.trackInstrumentId, command.type);
  assertProjectInstrumentEditable(state, command.trackInstrumentId, command.type);
  assertUniqueNoteIds(command.noteIds, command.type);

  for (const noteId of command.noteIds) {
    requireNote(track, noteId, command.type);
  }

  if (command.noteIds.length === 0) {
    return state;
  }

  const notesById: Record<NoteId, Note> = {
    ...track.notesById,
  };

  for (const noteId of command.noteIds) {
    delete notesById[noteId];
  }

  return replaceTrack(state, {
    ...track,
    notesById,
  });
}

export function applySetNotesEnabled(
  state: ActiveClipProjectState,
  command: SetNotesEnabledCommand,
): ActiveClipProjectState {
  const track = requireTrack(state, command.trackInstrumentId, command.type);

  assertProjectInstrumentEditable(state, command.trackInstrumentId, command.type);
  assertUniqueNoteIds(command.noteIds, command.type);

  if (typeof command.enabled !== "boolean") {
    reject(
      "INVALID_COMMAND",
      "Note enabled state must be a boolean.",
      command.type,
    );
  }

  let notesById: Record<NoteId, Note> | null = null;

  for (const noteId of command.noteIds) {
    const note = requireNote(track, noteId, command.type);

    if (note.enabled === command.enabled) {
      continue;
    }

    if (notesById === null) {
      notesById = {
        ...track.notesById,
      };
    }

    notesById[noteId] = {
      ...note,
      enabled: command.enabled,
    };
  }

  if (notesById === null) {
    return state;
  }

  return replaceTrack(state, {
    ...track,
    notesById,
  });
}
