import type { Note, NoteId } from "../model";
import { MAXIMUM_CLIP_NOTE_COUNT } from "../model";
import { assertValidNoteForTrack } from "../validation/note-validation";
import type { ActiveClipProjectState } from "./active-clip-project-state";
import type { AddNotesCommand, MoveNotesCommand } from "./command-types";
import {
  assertNoteWithinProject,
  notesOverlapInInstrument,
  replaceTrack,
} from "./active-clip-command-helpers";
import {
  assertProjectInstrumentEditable,
  assertUniqueNoteIds,
  countClipNotes,
  findNoteInstrumentId,
  hasOwn,
  reject,
  requireNote,
  requireTrack,
} from "./command-context";

export function applyAddNotes(
  state: ActiveClipProjectState,
  command: AddNotesCommand,
): ActiveClipProjectState {
  const track = requireTrack(state, command.trackInstrumentId, command.type);
  assertProjectInstrumentEditable(state, command.trackInstrumentId, command.type);
  const commandNoteIds = new Set<NoteId>();
  const acceptedNotes: Note[] = [];

  if (
    command.notes.length
    > MAXIMUM_CLIP_NOTE_COUNT - countClipNotes(state)
  ) {
    reject(
      "INVALID_COMMAND",
      `A clip cannot contain more than ${MAXIMUM_CLIP_NOTE_COUNT} notes.`,
      command.type,
    );
  }

  for (const note of command.notes) {
    assertValidNoteForTrack(note, command.trackInstrumentId);
    assertNoteWithinProject(state, note, command.type);

    if (commandNoteIds.has(note.id)) {
      reject(
        "DUPLICATE_NOTE_ID",
        `Note "${note.id}" appears more than once in the command.`,
        command.type,
      );
    }

    const existingInstrumentId = findNoteInstrumentId(state, note.id);

    if (existingInstrumentId !== undefined) {
      reject(
        "NOTE_ALREADY_EXISTS",
        `Note "${note.id}" already exists in instrument "${existingInstrumentId}".`,
        command.type,
      );
    }

    for (const candidateId in track.notesById) {
      const candidate = track.notesById[candidateId];

      if (
        candidate !== undefined
        && notesOverlapInInstrument(note, candidate)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Note "${note.id}" overlaps note "${candidate.id}" in instrument "${command.trackInstrumentId}".`,
          command.type,
        );
      }
    }

    for (
      let candidateIndex = 0;
      candidateIndex < acceptedNotes.length;
      candidateIndex += 1
    ) {
      const candidate = acceptedNotes[candidateIndex];

      if (
        candidate !== undefined
        && notesOverlapInInstrument(note, candidate)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Added notes "${note.id}" and "${candidate.id}" overlap.`,
          command.type,
        );
      }
    }

    commandNoteIds.add(note.id);
    acceptedNotes.push(note);
  }

  if (command.notes.length === 0) {
    return state;
  }

  const notesById: Record<NoteId, Note> = {
    ...track.notesById,
  };

  for (const note of command.notes) {
    notesById[note.id] = note;
  }

  return replaceTrack(state, {
    ...track,
    notesById,
  });
}

export function applyMoveNotes(
  state: ActiveClipProjectState,
  command: MoveNotesCommand,
): ActiveClipProjectState {
  if (
    !Number.isSafeInteger(command.deltaTicks)
    || !Number.isInteger(command.deltaPitch)
  ) {
    reject(
      "INVALID_COMMAND",
      "Move deltas must be integers.",
      command.type,
    );
  }

  const sourceTrack = requireTrack(
    state,
    command.sourceInstrumentId,
    command.type,
  );
  const targetTrack = requireTrack(
    state,
    command.targetInstrumentId,
    command.type,
  );
  assertProjectInstrumentEditable(state, command.sourceInstrumentId, command.type);

  if (command.targetInstrumentId !== command.sourceInstrumentId) {
    assertProjectInstrumentEditable(state, command.targetInstrumentId, command.type);
  }

  assertUniqueNoteIds(command.noteIds, command.type);

  const movedNotes: Note[] = [];

  for (const noteId of command.noteIds) {
    const note = requireNote(sourceTrack, noteId, command.type);
    const movedNote: Note = {
      ...note,
      pitch: note.pitch + command.deltaPitch,
      startTick: note.startTick + command.deltaTicks,
      instrumentId: command.targetInstrumentId,
    };

    assertValidNoteForTrack(movedNote, command.targetInstrumentId);
    assertNoteWithinProject(state, movedNote, command.type);

    if (
      command.sourceInstrumentId !== command.targetInstrumentId
      && hasOwn(targetTrack.notesById, noteId)
    ) {
      reject(
        "NOTE_ALREADY_EXISTS",
        `Note "${noteId}" already exists in track "${targetTrack.instrumentId}".`,
        command.type,
      );
    }

    movedNotes.push(movedNote);
  }

  const movedNoteIds = new Set(command.noteIds);

  for (
    let movedIndex = 0;
    movedIndex < movedNotes.length;
    movedIndex += 1
  ) {
    const movedNote = movedNotes[movedIndex];

    if (movedNote === undefined) {
      continue;
    }

    for (const candidateId in targetTrack.notesById) {
      const candidate = targetTrack.notesById[candidateId];

      if (
        candidate !== undefined
        && !(
          command.sourceInstrumentId === command.targetInstrumentId
          && movedNoteIds.has(candidate.id)
        )
        && notesOverlapInInstrument(movedNote, candidate)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Note "${movedNote.id}" overlaps note "${candidate.id}" in instrument "${command.targetInstrumentId}".`,
          command.type,
        );
      }
    }

    if (command.sourceInstrumentId !== command.targetInstrumentId) {
      for (
        let candidateIndex = 0;
        candidateIndex < movedIndex;
        candidateIndex += 1
      ) {
        const candidate = movedNotes[candidateIndex];

        if (
          candidate !== undefined
          && notesOverlapInInstrument(movedNote, candidate)
        ) {
          reject(
            "NOTE_OVERLAP",
            `Transferred notes "${movedNote.id}" and "${candidate.id}" overlap.`,
            command.type,
          );
        }
      }
    }
  }

  if (
    movedNotes.length === 0
    || (
      command.sourceInstrumentId === command.targetInstrumentId
      && command.deltaTicks === 0
      && command.deltaPitch === 0
    )
  ) {
    return state;
  }

  if (command.sourceInstrumentId === command.targetInstrumentId) {
    const notesById: Record<NoteId, Note> = {
      ...sourceTrack.notesById,
    };

    for (const note of movedNotes) {
      notesById[note.id] = note;
    }

    return replaceTrack(state, {
      ...sourceTrack,
      notesById,
    });
  }

  const sourceNotesById: Record<NoteId, Note> = {
    ...sourceTrack.notesById,
  };
  const targetNotesById: Record<NoteId, Note> = {
    ...targetTrack.notesById,
  };

  for (const note of movedNotes) {
    delete sourceNotesById[note.id];
    targetNotesById[note.id] = note;
  }

  return {
    ...state,
    tracksByInstrumentId: {
      ...state.tracksByInstrumentId,
      [sourceTrack.instrumentId]: {
        ...sourceTrack,
        notesById: sourceNotesById,
      },
      [targetTrack.instrumentId]: {
        ...targetTrack,
        notesById: targetNotesById,
      },
    },
  };
}
