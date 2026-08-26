import { type Note } from "../notes/note";
import {
  type NoteId,
} from "../identifiers";
import type { ActiveClipProjectState } from "./active-clip-project-state";
import type {
  DeleteNotesCommand,
  SetNotesLockedCommand,
  SetNotesMutedCommand,
} from "./command-types";
import {
  replaceTrack,
} from "./active-clip-command-helpers";
import {
  assertNoteEditable,
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
  assertUniqueNoteIds(command.noteIds, command.type);

  for (const noteId of command.noteIds) {
    assertNoteEditable(requireNote(track, noteId, command.type), command.type);
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

export function applySetNotesMuted(
  state: ActiveClipProjectState,
  command: SetNotesMutedCommand,
): ActiveClipProjectState {
  return applyNoteBooleanProperty(state, command, "muted", command.muted);
}

export function applySetNotesLocked(
  state: ActiveClipProjectState,
  command: SetNotesLockedCommand,
): ActiveClipProjectState {
  return applyNoteBooleanProperty(state, command, "locked", command.locked);
}

function applyNoteBooleanProperty(
  state: ActiveClipProjectState,
  command: SetNotesMutedCommand | SetNotesLockedCommand,
  property: "muted" | "locked",
  value: boolean,
): ActiveClipProjectState {
  const track = requireTrack(state, command.trackInstrumentId, command.type);
  assertUniqueNoteIds(command.noteIds, command.type);
  if (typeof value !== "boolean") {
    reject("INVALID_COMMAND", `Note ${property} must be a boolean.`, command.type);
  }

  let notesById: Record<NoteId, Note> | null = null;

  for (const noteId of command.noteIds) {
    const note = requireNote(track, noteId, command.type);

    if (note[property] === value) {
      continue;
    }

    if (notesById === null) {
      notesById = {
        ...track.notesById,
      };
    }

    notesById[noteId] = {
      ...note,
      [property]: value,
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
