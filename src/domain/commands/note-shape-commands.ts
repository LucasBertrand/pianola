import {
  type Note,
} from "../notes/note";
import {
  type NoteId,
} from "../identifiers";
import {
  MAXIMUM_CLIP_NOTE_COUNT,
} from "../notes/note";
import { assertValidNoteForInstrumentTrack } from "../validation/note-validation";
import type { ActiveClipProjectState } from "./active-clip-project-state";
import type {
  SliceNotesCommand,
  TransformNotesCommand,
} from "./command-types";
import {
  assertNoteWithinProject,
  notesOverlapInInstrument,
  replaceInstrumentTrack,
} from "./active-clip-command-helpers";
import {
  assertNoteEditable,
  countClipNotes,
  findNoteInstrumentId,
  reject,
  requireNote,
  requireInstrumentTrack,
} from "./command-context";

export function applyTransformNotes(
  state: ActiveClipProjectState,
  command: TransformNotesCommand,
): ActiveClipProjectState {
  const track = requireInstrumentTrack(state, command.trackInstrumentId, command.type);
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
      || !Number.isSafeInteger(change.durationTicks)
      || !Number.isInteger(change.pitch)
    ) {
      reject(
        "INVALID_COMMAND",
        "Transformed note coordinates and durations must be integers.",
        command.type,
      );
    }

    const note = requireNote(track, change.noteId, command.type);
    assertNoteEditable(note, command.type);
    const updatedNote: Note = {
      ...note,
      startTick: change.startTick,
      durationTicks: change.durationTicks,
      pitch: change.pitch,
    };

    assertValidNoteForInstrumentTrack(updatedNote, track.instrumentId);
    assertNoteWithinProject(state, updatedNote, command.type);
    changedNoteIds.add(change.noteId);
    updatedNotes.push(updatedNote);

    if (
      updatedNote.startTick !== note.startTick
      || updatedNote.durationTicks !== note.durationTicks
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
          `Transformed notes "${updatedNote.id}" and "${candidate.id}" overlap.`,
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

export function applySliceNotes(
  state: ActiveClipProjectState,
  command: SliceNotesCommand,
): ActiveClipProjectState {
  const track = requireInstrumentTrack(state, command.trackInstrumentId, command.type);

  if (!Number.isSafeInteger(command.sliceTick)) {
    reject(
      "INVALID_COMMAND",
      "The note slice tick must be an integer.",
      command.type,
    );
  }

  if (
    command.slices.length
    > MAXIMUM_CLIP_NOTE_COUNT - countClipNotes(state)
  ) {
    reject(
      "INVALID_COMMAND",
      `A clip cannot contain more than ${MAXIMUM_CLIP_NOTE_COUNT} notes.`,
      command.type,
    );
  }

  const sourceNoteIds = new Set<NoteId>();
  const rightNoteIds = new Set<NoteId>();
  const leftNotes: Note[] = [];
  const rightNotes: Note[] = [];

  for (const slice of command.slices) {
    if (sourceNoteIds.has(slice.noteId)) {
      reject(
        "DUPLICATE_NOTE_ID",
        `Note "${slice.noteId}" appears more than once in the command.`,
        command.type,
      );
    }

    if (
      slice.rightNoteId === slice.noteId
      || rightNoteIds.has(slice.rightNoteId)
      || findNoteInstrumentId(state, slice.rightNoteId) !== undefined
    ) {
      reject(
        "NOTE_ALREADY_EXISTS",
        `Right-hand note ID "${slice.rightNoteId}" is already in use.`,
        command.type,
      );
    }

    const note = requireNote(track, slice.noteId, command.type);
    assertNoteEditable(note, command.type);
    const noteEndTick = note.startTick + note.durationTicks;

    if (
      command.sliceTick <= note.startTick
      || command.sliceTick >= noteEndTick
    ) {
      reject(
        "INVALID_COMMAND",
        `Note "${note.id}" does not cross the slice tick.`,
        command.type,
      );
    }

    const leftNote: Note = {
      ...note,
      durationTicks: command.sliceTick - note.startTick,
    };
    const rightNote: Note = {
      ...note,
      id: slice.rightNoteId,
      startTick: command.sliceTick,
      durationTicks: noteEndTick - command.sliceTick,
    };

    assertValidNoteForInstrumentTrack(leftNote, track.instrumentId);
    assertValidNoteForInstrumentTrack(rightNote, track.instrumentId);
    sourceNoteIds.add(slice.noteId);
    rightNoteIds.add(slice.rightNoteId);
    leftNotes.push(leftNote);
    rightNotes.push(rightNote);
  }

  if (leftNotes.length === 0) {
    return state;
  }

  const notesById: Record<NoteId, Note> = {
    ...track.notesById,
  };

  for (
    let noteIndex = 0;
    noteIndex < leftNotes.length;
    noteIndex += 1
  ) {
    const leftNote = leftNotes[noteIndex];
    const rightNote = rightNotes[noteIndex];

    if (leftNote !== undefined && rightNote !== undefined) {
      notesById[leftNote.id] = leftNote;
      notesById[rightNote.id] = rightNote;
    }
  }

  return replaceInstrumentTrack(state, {
    ...track,
    notesById,
  });
}
