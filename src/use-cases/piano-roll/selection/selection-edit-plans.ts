import type {
  PianoRollCommand,
} from "../../../domain/commands/command-types";
import {
  getClip,
  type ProjectDocument,
} from "../../../domain/project/project-document";
import {
  getClipMeasureCount,
  getClipTimeSignature,
  MAXIMUM_MEASURE_COUNT,
} from "../../../domain/clips/clip";
import {
  getTicksPerMeasure,
} from "../../../domain/transport/transport";
import {
  type Note,
} from "../../../domain/notes/note";
import {
  type ClipId,
  type NoteId,
  type InstrumentId,
} from "../../../domain/identifiers";

export interface PianoRollClipboard {
  readonly notes: readonly Note[];
  readonly originTick: number;
}

export interface SliceCommandPlan {
  readonly commands: readonly PianoRollCommand[];
  readonly resultingNoteIds: readonly NoteId[];
}

export type InstrumentTransferPlan =
  | {
      readonly valid: true;
      readonly commands: readonly PianoRollCommand[];
      readonly originalNotes: readonly Note[];
      readonly proposedNotes: readonly Note[];
    }
  | {
      readonly valid: false;
      readonly message: string;
    };

export function buildTransformCommandsForNotes(
  clipId: ClipId,
  notes: readonly Note[],
): readonly PianoRollCommand[] {
  const notesByInstrument = new Map<InstrumentId, Note[]>();

  for (
    let noteIndex = 0;
    noteIndex < notes.length;
    noteIndex += 1
  ) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    let instrumentNotes = notesByInstrument.get(note.instrumentId);

    if (instrumentNotes === undefined) {
      instrumentNotes = [];
      notesByInstrument.set(note.instrumentId, instrumentNotes);
    }

    instrumentNotes.push(note);
  }

  const commands: PianoRollCommand[] = [];

  for (const [instrumentId, instrumentNotes] of notesByInstrument) {
    commands.push({
      type: "TransformNotes",
      clipId,
      trackInstrumentId: instrumentId,
      changes: instrumentNotes.map((note) => ({
        noteId: note.id,
        startTick: note.startTick,
        durationTicks: note.durationTicks,
        pitch: note.pitch,
      })),
    });
  }

  return commands;
}

export function buildSliceCommandsForNotes(
  clipId: ClipId,
  notes: readonly Note[],
  sliceTick: number,
  timestamp: number,
  transactionSequence: number,
): SliceCommandPlan {
  const slicesByInstrument = new Map<
    InstrumentId,
    Array<{ readonly noteId: NoteId; readonly rightNoteId: NoteId }>
  >();
  const resultingNoteIds: NoteId[] = [];
  let sliceSequence = 0;

  for (const note of notes) {
    if (
      sliceTick <= note.startTick
      || sliceTick >= note.startTick + note.durationTicks
    ) {
      resultingNoteIds.push(note.id);
      continue;
    }

    let slices = slicesByInstrument.get(note.instrumentId);

    if (slices === undefined) {
      slices = [];
      slicesByInstrument.set(note.instrumentId, slices);
    }

    const rightNoteId =
      `slice-${timestamp}-${transactionSequence}-${sliceSequence}`;

    sliceSequence += 1;
    slices.push({
      noteId: note.id,
      rightNoteId,
    });
    resultingNoteIds.push(note.id, rightNoteId);
  }

  const commands: PianoRollCommand[] = [];

  for (const [instrumentId, slices] of slicesByInstrument) {
    commands.push({
      type: "SliceNotes",
      clipId,
      trackInstrumentId: instrumentId,
      sliceTick,
      slices,
    });
  }

  return {
    commands,
    resultingNoteIds,
  };
}

export function createPastedNotes(
  clipboard: PianoRollClipboard,
  pasteTick: number,
  timestamp: number,
  sequence: number,
): readonly Note[] {
  const notes: Note[] = [];

  for (
    let noteIndex = 0;
    noteIndex < clipboard.notes.length;
    noteIndex += 1
  ) {
    const sourceNote = clipboard.notes[noteIndex];

    if (sourceNote === undefined) {
      continue;
    }

    notes.push({
      ...sourceNote,
      id:
        `${sourceNote.id}-copy-${timestamp}-${sequence}-${noteIndex}`,
      startTick:
        pasteTick
        + sourceNote.startTick
        - clipboard.originTick,
    });
  }

  return notes;
}

export function canPlacePastedNotes(
  state: ProjectDocument,
  clipId: ClipId,
  notes: readonly Note[],
): boolean {
  const clip = getClip(state, clipId);

  for (
    let noteIndex = 0;
    noteIndex < notes.length;
    noteIndex += 1
  ) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    const instrument = state.projectInstrumentsById[note.instrumentId];
    const track = clip.tracksByInstrumentId[note.instrumentId];

    if (
      instrument === undefined
      || clip.instrumentStatesById[note.instrumentId]?.locked !== false
      || track === undefined
      || note.startTick < 0
    ) {
      return false;
    }
  }

  return (
    notes.length > 0
    && getRequiredMeasureCountForNotes(state, clipId, notes)
      <= MAXIMUM_MEASURE_COUNT
  );
}

export function getRequiredMeasureCountForNotes(
  state: ProjectDocument,
  clipId: ClipId,
  notes: readonly Note[],
): number {
  const clip = getClip(state, clipId);
  let maximumEndTick = 0;

  for (const note of notes) {
    const noteEndTick = note.startTick + note.durationTicks;

    if (!Number.isSafeInteger(noteEndTick) || noteEndTick <= 0) {
      return MAXIMUM_MEASURE_COUNT + 1;
    }

    maximumEndTick = Math.max(maximumEndTick, noteEndTick);
  }

  const ticksPerMeasure = getTicksPerMeasure(
    state.clock,
    getClipTimeSignature(clip),
  );

  return Math.max(
    getClipMeasureCount(state.clock, clip),
    Math.ceil(maximumEndTick / ticksPerMeasure),
  );
}

export function createInstrumentTransferPlan(
  state: ProjectDocument,
  clipId: ClipId,
  selectedNotes: readonly Note[],
  targetInstrumentId: InstrumentId,
): InstrumentTransferPlan {
  const clip = getClip(state, clipId);
  const targetInstrument = state.projectInstrumentsById[targetInstrumentId];
  const targetTrack = clip.tracksByInstrumentId[targetInstrumentId];

  if (targetInstrument === undefined || targetTrack === undefined) {
    return {
      valid: false,
      message: "The selected target instrument is unavailable.",
    };
  }

  if (clip.instrumentStatesById[targetInstrumentId]?.locked !== false) {
    return {
      valid: false,
      message: "Unlock the selected target instrument before transferring notes.",
    };
  }

  const transferredNotes: Note[] = [];
  const originalNotes: Note[] = [];
  const noteIdsBySourceInstrument = new Map<InstrumentId, NoteId[]>();

  for (
    let noteIndex = 0;
    noteIndex < selectedNotes.length;
    noteIndex += 1
  ) {
    const selectedNote = selectedNotes[noteIndex];

    if (selectedNote === undefined) {
      continue;
    }

    const sourceInstrument = state.projectInstrumentsById[selectedNote.instrumentId];
    const sourceTrack = clip.tracksByInstrumentId[selectedNote.instrumentId];

    if (
      sourceInstrument === undefined
      || sourceTrack?.notesById[selectedNote.id] === undefined
    ) {
      return {
        valid: false,
        message: "The selection contains a note that is no longer available.",
      };
    }

    if (clip.instrumentStatesById[selectedNote.instrumentId]?.locked !== false) {
      return {
        valid: false,
        message: `Unlock instrument "${sourceInstrument.name}" before transferring its notes.`,
      };
    }

    if (selectedNote.instrumentId === targetInstrumentId) {
      continue;
    }

    if (targetTrack.notesById[selectedNote.id] !== undefined) {
      return {
        valid: false,
        message: `Transfer cancelled because note ID "${selectedNote.id}" already exists in the target instrument.`,
      };
    }

    originalNotes.push(selectedNote);
    transferredNotes.push({
      ...selectedNote,
      instrumentId: targetInstrumentId,
    });
    let sourceNoteIds = noteIdsBySourceInstrument.get(
      selectedNote.instrumentId,
    );

    if (sourceNoteIds === undefined) {
      sourceNoteIds = [];
      noteIdsBySourceInstrument.set(
        selectedNote.instrumentId,
        sourceNoteIds,
      );
    }

    sourceNoteIds.push(selectedNote.id);
  }

  const commands: PianoRollCommand[] = [];

  for (const [sourceInstrumentId, noteIds] of noteIdsBySourceInstrument) {
    commands.push({
      type: "MoveNotes",
      clipId: clip.id,
      sourceInstrumentId,
      targetInstrumentId,
      noteIds,
      deltaTicks: 0,
      deltaPitch: 0,
    });
  }

  return {
    valid: true,
    commands,
    originalNotes,
    proposedNotes: transferredNotes,
  };
}

export function findNotesByIds(
  state: ProjectDocument,
  clipId: ClipId,
  noteIds: readonly NoteId[],
): readonly Note[] {
  const clip = getClip(state, clipId);
  const notes: Note[] = [];
  const acceptedNoteIds = new Set<NoteId>();

  for (const noteId of noteIds) {
    if (acceptedNoteIds.has(noteId)) {
      continue;
    }

    for (const instrumentId of state.instrumentOrder) {
      const note = clip.tracksByInstrumentId[instrumentId]?.notesById[noteId];

      if (note !== undefined) {
        acceptedNoteIds.add(note.id);
        notes.push(note);
        break;
      }
    }
  }

  return notes;
}
