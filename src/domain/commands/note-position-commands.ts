import {
  type Note,
} from "../notes/note";
import {
  type NoteId,
} from "../identifiers";
import { assertValidNoteForInstrumentTrack } from "../validation/note-validation";
import type { ActiveClipProjectState } from "./active-clip-project-state";
import type {
  RepositionNotesCommand,
  ResizeNotesCommand,
} from "./command-types";
import {
  assertNoteWithinProject,
  notesOverlapInInstrument,
  replaceInstrumentTrack,
} from "./active-clip-command-helpers";
import {
  assertNoteEditable,
  reject,
  requireNote,
  requireInstrumentTrack,
} from "./command-context";

export function applyRepositionNotes(
  state: ActiveClipProjectState,
  command: RepositionNotesCommand,
): ActiveClipProjectState {
  const track = requireInstrumentTrack(
    state,
    command.trackInstrumentId,
    command.type,
  );

  const changedNoteIds = new Set<NoteId>();
  const updatedNotes: Note[] = [];
  let hasChanges = false;

  for (const change of command.changes) {
    if (changedNoteIds.has(change.noteId)) {
      reject(
        "DUPLICATE_NOTE_ID",
        `Note "${change.noteId}" appears more than once in the command.`,
        command.type,
      );
    }

    if (
      !Number.isSafeInteger(change.startTick)
      || !Number.isInteger(change.pitch)
    ) {
      reject(
        "INVALID_COMMAND",
        "Repositioned note coordinates must be integers.",
        command.type,
      );
    }

    const note = requireNote(
      track,
      change.noteId,
      command.type,
    );
    assertNoteEditable(note, command.type);
    const updatedNote: Note = {
      ...note,
      startTick: change.startTick,
      pitch: change.pitch,
    };

    assertValidNoteForInstrumentTrack(updatedNote, track.instrumentId);
    assertNoteWithinProject(state, updatedNote, command.type);
    changedNoteIds.add(change.noteId);
    updatedNotes.push(updatedNote);

    if (
      updatedNote.startTick !== note.startTick
      || updatedNote.pitch !== note.pitch
    ) {
      hasChanges = true;
    }
  }

  if (updatedNotes.length === 0 || !hasChanges) {
    return state;
  }

  for (
    let updatedIndex = 0;
    updatedIndex < updatedNotes.length;
    updatedIndex += 1
  ) {
    const updatedNote = updatedNotes[updatedIndex];

    if (updatedNote === undefined) {
      continue;
    }

    for (const candidateId in track.notesById) {
      const candidate = track.notesById[candidateId];

      if (
        candidate !== undefined
        && !changedNoteIds.has(candidate.id)
        && notesOverlapInInstrument(updatedNote, candidate)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Note "${updatedNote.id}" overlaps note "${candidate.id}" in instrument "${command.trackInstrumentId}".`,
          command.type,
        );
      }
    }

    for (
      let candidateIndex = 0;
      candidateIndex < updatedIndex;
      candidateIndex += 1
    ) {
      const candidate = updatedNotes[candidateIndex];

      if (
        candidate !== undefined
        && notesOverlapInInstrument(updatedNote, candidate)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Repositioned notes "${updatedNote.id}" and "${candidate.id}" overlap.`,
          command.type,
        );
      }
    }
  }

  const notesById: Record<NoteId, Note> = {
    ...track.notesById,
  };

  for (const note of updatedNotes) {
    notesById[note.id] = note;
  }

  return replaceInstrumentTrack(state, {
    ...track,
    notesById,
  });
}

export function applyResizeNotes(
  state: ActiveClipProjectState,
  command: ResizeNotesCommand,
): ActiveClipProjectState {
  const track = requireInstrumentTrack(state, command.trackInstrumentId, command.type);
  const changedNoteIds = new Set<NoteId>();
  const updatedNotes: Note[] = [];

  for (const change of command.changes) {
    if (changedNoteIds.has(change.noteId)) {
      reject(
        "DUPLICATE_NOTE_ID",
        `Note "${change.noteId}" appears more than once in the command.`,
        command.type,
      );
    }

    const note = requireNote(track, change.noteId, command.type);
    assertNoteEditable(note, command.type);
    const updatedNote: Note = {
      ...note,
      startTick: change.startTick ?? note.startTick,
      durationTicks: change.durationTicks,
    };

    assertValidNoteForInstrumentTrack(updatedNote, track.instrumentId);
    assertNoteWithinProject(state, updatedNote, command.type);
    changedNoteIds.add(change.noteId);
    updatedNotes.push(updatedNote);
  }

  if (updatedNotes.length === 0) {
    return state;
  }

  for (
    let updatedIndex = 0;
    updatedIndex < updatedNotes.length;
    updatedIndex += 1
  ) {
    const updatedNote = updatedNotes[updatedIndex];

    if (updatedNote === undefined) {
      continue;
    }

    for (const candidateId in track.notesById) {
      const candidate = track.notesById[candidateId];

      if (
        candidate !== undefined
        && !changedNoteIds.has(candidate.id)
        && notesOverlapInInstrument(updatedNote, candidate)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Note "${updatedNote.id}" overlaps note "${candidate.id}" in instrument "${command.trackInstrumentId}".`,
          command.type,
        );
      }
    }

    for (
      let candidateIndex = 0;
      candidateIndex < updatedIndex;
      candidateIndex += 1
    ) {
      const candidate = updatedNotes[candidateIndex];

      if (
        candidate !== undefined
        && notesOverlapInInstrument(updatedNote, candidate)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Resized notes "${updatedNote.id}" and "${candidate.id}" overlap.`,
          command.type,
        );
      }
    }
  }

  const notesById: Record<NoteId, Note> = {
    ...track.notesById,
  };

  for (const note of updatedNotes) {
    notesById[note.id] = note;
  }

  return replaceInstrumentTrack(state, {
    ...track,
    notesById,
  });
}
