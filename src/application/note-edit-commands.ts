import type {
  NoteDurationChange,
  NotePositionChange,
  PianoRollCommand,
} from "../domain/commands";
import type {
  Note,
  NoteId,
  VoiceId,
} from "../domain/model";

export type NoteResizeEdge = "start" | "end";

/** Creates one add command per affected voice. */
export function buildAddNoteCommands(
  notes: readonly Note[],
): readonly PianoRollCommand[] {
  const notesByVoice = groupNotesByVoice(notes);
  const commands: PianoRollCommand[] = [];

  for (const [voiceId, voiceNotes] of notesByVoice) {
    commands.push({
      type: "AddNotes",
      trackVoiceId: voiceId,
      notes: voiceNotes,
    });
  }

  return commands;
}

/** Creates one delete command per affected voice. */
export function buildDeleteNoteCommands(
  notes: readonly Note[],
): readonly PianoRollCommand[] {
  const noteIdsByVoice = new Map<VoiceId, NoteId[]>();

  for (const note of notes) {
    let noteIds = noteIdsByVoice.get(note.voiceId);

    if (noteIds === undefined) {
      noteIds = [];
      noteIdsByVoice.set(note.voiceId, noteIds);
    }

    noteIds.push(note.id);
  }

  const commands: PianoRollCommand[] = [];

  for (const [voiceId, noteIds] of noteIdsByVoice) {
    commands.push({
      type: "DeleteNotes",
      trackVoiceId: voiceId,
      noteIds,
    });
  }

  return commands;
}

/** Creates atomic absolute-position updates grouped by voice. */
export function buildRepositionNoteCommands(
  notes: readonly Note[],
): readonly PianoRollCommand[] {
  const notesByVoice = groupNotesByVoice(notes);
  const commands: PianoRollCommand[] = [];

  for (const [voiceId, voiceNotes] of notesByVoice) {
    const changes: NotePositionChange[] = [];

    for (const note of voiceNotes) {
      changes.push({
        noteId: note.id,
        startTick: note.startTick,
        pitch: note.pitch,
      });
    }

    commands.push({
      type: "RepositionNotes",
      trackVoiceId: voiceId,
      changes,
    });
  }

  return commands;
}

/** Creates resize commands from the original notes and a shared delta. */
export function buildResizeNoteCommands(
  notes: readonly Note[],
  deltaTicks: number,
  edge: NoteResizeEdge,
): readonly PianoRollCommand[] {
  const notesByVoice = groupNotesByVoice(notes);
  const commands: PianoRollCommand[] = [];

  for (const [voiceId, voiceNotes] of notesByVoice) {
    const changes: NoteDurationChange[] = [];

    for (const note of voiceNotes) {
      changes.push({
        noteId: note.id,
        startTick:
          edge === "start"
            ? note.startTick + deltaTicks
            : note.startTick,
        durationTicks:
          edge === "start"
            ? note.durationTicks - deltaTicks
            : note.durationTicks + deltaTicks,
      });
    }

    commands.push({
      type: "ResizeNotes",
      trackVoiceId: voiceId,
      changes,
    });
  }

  return commands;
}

/** Materializes the notes proposed by a resize gesture. */
export function resizeNotes(
  notes: readonly Note[],
  deltaTicks: number,
  edge: NoteResizeEdge,
): readonly Note[] {
  const resizedNotes: Note[] = [];

  for (const note of notes) {
    resizedNotes.push({
      ...note,
      startTick:
        edge === "start"
          ? note.startTick + deltaTicks
          : note.startTick,
      durationTicks:
        edge === "start"
          ? note.durationTicks - deltaTicks
          : note.durationTicks + deltaTicks,
    });
  }

  return resizedNotes;
}

function groupNotesByVoice(
  notes: readonly Note[],
): ReadonlyMap<VoiceId, readonly Note[]> {
  const notesByVoice = new Map<VoiceId, Note[]>();

  for (const note of notes) {
    let voiceNotes = notesByVoice.get(note.voiceId);

    if (voiceNotes === undefined) {
      voiceNotes = [];
      notesByVoice.set(note.voiceId, voiceNotes);
    }

    voiceNotes.push(note);
  }

  return notesByVoice;
}
