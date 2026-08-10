import type {
  PianoRollCommand,
} from "../domain/commands";
import {
  getActiveClip,
  getTicksPerMeasure,
  MAXIMUM_MEASURE_COUNT,
  type Note,
  type NoteId,
  type ProjectState,
  type VoiceId,
} from "../domain/model";

export interface PianoRollClipboard {
  readonly notes: readonly Note[];
  readonly originTick: number;
}

export interface SliceCommandPlan {
  readonly commands: readonly PianoRollCommand[];
  readonly resultingNoteIds: readonly NoteId[];
}

export type VoiceTransferPlan =
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
  notes: readonly Note[],
): readonly PianoRollCommand[] {
  const notesByVoice = new Map<VoiceId, Note[]>();

  for (
    let noteIndex = 0;
    noteIndex < notes.length;
    noteIndex += 1
  ) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    let voiceNotes = notesByVoice.get(note.voiceId);

    if (voiceNotes === undefined) {
      voiceNotes = [];
      notesByVoice.set(note.voiceId, voiceNotes);
    }

    voiceNotes.push(note);
  }

  const commands: PianoRollCommand[] = [];

  for (const [voiceId, voiceNotes] of notesByVoice) {
    commands.push({
      type: "TransformNotes",
      trackVoiceId: voiceId,
      changes: voiceNotes.map((note) => ({
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
  notes: readonly Note[],
  sliceTick: number,
  timestamp: number,
  transactionSequence: number,
): SliceCommandPlan {
  const slicesByVoice = new Map<
    VoiceId,
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

    let slices = slicesByVoice.get(note.voiceId);

    if (slices === undefined) {
      slices = [];
      slicesByVoice.set(note.voiceId, slices);
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

  for (const [voiceId, slices] of slicesByVoice) {
    commands.push({
      type: "SliceNotes",
      trackVoiceId: voiceId,
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
  state: ProjectState,
  notes: readonly Note[],
): boolean {
  const clip = getActiveClip(state);

  for (
    let noteIndex = 0;
    noteIndex < notes.length;
    noteIndex += 1
  ) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    const voice = state.voicesById[note.voiceId];
    const track = clip.tracksByVoiceId[note.voiceId];

    if (
      voice === undefined
      || voice.locked
      || track === undefined
      || note.startTick < 0
    ) {
      return false;
    }
  }

  return (
    notes.length > 0
    && getRequiredMeasureCountForNotes(state, notes)
      <= MAXIMUM_MEASURE_COUNT
  );
}

export function getRequiredMeasureCountForNotes(
  state: ProjectState,
  notes: readonly Note[],
): number {
  const clip = getActiveClip(state);
  let maximumEndTick = 0;

  for (const note of notes) {
    const noteEndTick = note.startTick + note.durationTicks;

    if (!Number.isSafeInteger(noteEndTick) || noteEndTick <= 0) {
      return MAXIMUM_MEASURE_COUNT + 1;
    }

    maximumEndTick = Math.max(maximumEndTick, noteEndTick);
  }

  const ticksPerMeasure = getTicksPerMeasure(
    clip.transportSettings,
  );

  return Math.max(
    clip.measureCount,
    Math.ceil(maximumEndTick / ticksPerMeasure),
  );
}

export function createVoiceTransferPlan(
  state: ProjectState,
  selectedNotes: readonly Note[],
  targetVoiceId: VoiceId,
): VoiceTransferPlan {
  const clip = getActiveClip(state);
  const targetVoice = state.voicesById[targetVoiceId];
  const targetTrack = clip.tracksByVoiceId[targetVoiceId];

  if (targetVoice === undefined || targetTrack === undefined) {
    return {
      valid: false,
      message: "The selected target voice is unavailable.",
    };
  }

  if (targetVoice.locked) {
    return {
      valid: false,
      message: "Unlock the selected target voice before transferring notes.",
    };
  }

  const transferredNotes: Note[] = [];
  const originalNotes: Note[] = [];
  const noteIdsBySourceVoice = new Map<VoiceId, NoteId[]>();

  for (
    let noteIndex = 0;
    noteIndex < selectedNotes.length;
    noteIndex += 1
  ) {
    const selectedNote = selectedNotes[noteIndex];

    if (selectedNote === undefined) {
      continue;
    }

    const sourceVoice = state.voicesById[selectedNote.voiceId];
    const sourceTrack = clip.tracksByVoiceId[selectedNote.voiceId];

    if (
      sourceVoice === undefined
      || sourceTrack?.notesById[selectedNote.id] === undefined
    ) {
      return {
        valid: false,
        message: "The selection contains a note that is no longer available.",
      };
    }

    if (sourceVoice.locked) {
      return {
        valid: false,
        message: `Unlock voice "${sourceVoice.name}" before transferring its notes.`,
      };
    }

    if (selectedNote.voiceId === targetVoiceId) {
      continue;
    }

    if (targetTrack.notesById[selectedNote.id] !== undefined) {
      return {
        valid: false,
        message: `Transfer cancelled because note ID "${selectedNote.id}" already exists in the target voice.`,
      };
    }

    originalNotes.push(selectedNote);
    transferredNotes.push({
      ...selectedNote,
      voiceId: targetVoiceId,
    });
    let sourceNoteIds = noteIdsBySourceVoice.get(
      selectedNote.voiceId,
    );

    if (sourceNoteIds === undefined) {
      sourceNoteIds = [];
      noteIdsBySourceVoice.set(
        selectedNote.voiceId,
        sourceNoteIds,
      );
    }

    sourceNoteIds.push(selectedNote.id);
  }

  const commands: PianoRollCommand[] = [];

  for (const [sourceVoiceId, noteIds] of noteIdsBySourceVoice) {
    commands.push({
      type: "MoveNotes",
      sourceVoiceId,
      targetVoiceId,
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
  state: ProjectState,
  noteIds: readonly NoteId[],
): readonly Note[] {
  const clip = getActiveClip(state);
  const notes: Note[] = [];
  const acceptedNoteIds = new Set<NoteId>();

  for (const noteId of noteIds) {
    if (acceptedNoteIds.has(noteId)) {
      continue;
    }

    for (const voiceId of state.voiceOrder) {
      const note = clip.tracksByVoiceId[voiceId]?.notesById[noteId];

      if (note !== undefined) {
        acceptedNoteIds.add(note.id);
        notes.push(note);
        break;
      }
    }
  }

  return notes;
}
