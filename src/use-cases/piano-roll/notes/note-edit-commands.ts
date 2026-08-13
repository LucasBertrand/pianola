import type {
  NoteDurationChange,
  NotePositionChange,
  PianoRollCommand,
} from "../../../domain/commands/command-types";
import {
  type ClipId,
  type NoteId,
  type InstrumentId,
} from "../../../domain/identifiers";
import {
  type Note,
} from "../../../domain/notes/note";

export type NoteResizeEdge = "start" | "end";

/** Creates one add command per affected instrument. */
export function buildAddNoteCommands(
  clipId: ClipId,
  notes: readonly Note[],
): readonly PianoRollCommand[] {
  const notesByInstrument = groupNotesByInstrument(notes);
  const commands: PianoRollCommand[] = [];

  for (const [instrumentId, instrumentNotes] of notesByInstrument) {
    commands.push({
      type: "AddNotes",
      clipId,
      trackInstrumentId: instrumentId,
      notes: instrumentNotes,
    });
  }

  return commands;
}

/** Creates one delete command per affected instrument. */
export function buildDeleteNoteCommands(
  clipId: ClipId,
  notes: readonly Note[],
): readonly PianoRollCommand[] {
  const noteIdsByInstrument = new Map<InstrumentId, NoteId[]>();

  for (const note of notes) {
    let noteIds = noteIdsByInstrument.get(note.instrumentId);

    if (noteIds === undefined) {
      noteIds = [];
      noteIdsByInstrument.set(note.instrumentId, noteIds);
    }

    noteIds.push(note.id);
  }

  const commands: PianoRollCommand[] = [];

  for (const [instrumentId, noteIds] of noteIdsByInstrument) {
    commands.push({
      type: "DeleteNotes",
      clipId,
      trackInstrumentId: instrumentId,
      noteIds,
    });
  }

  return commands;
}

/** Creates explicit enabled-state updates grouped by instrument. */
export function buildSetNotesEnabledCommands(
  clipId: ClipId,
  notes: readonly Note[],
  enabled: boolean,
): readonly PianoRollCommand[] {
  const notesByInstrument = groupNotesByInstrument(notes);
  const commands: PianoRollCommand[] = [];

  for (const [instrumentId, instrumentNotes] of notesByInstrument) {
    const noteIds: NoteId[] = [];

    for (const note of instrumentNotes) {
      noteIds.push(note.id);
    }

    commands.push({
      type: "SetNotesEnabled",
      clipId,
      trackInstrumentId: instrumentId,
      noteIds,
      enabled,
    });
  }

  return commands;
}

/** Creates atomic absolute-position updates grouped by instrument. */
export function buildRepositionNoteCommands(
  clipId: ClipId,
  notes: readonly Note[],
): readonly PianoRollCommand[] {
  const notesByInstrument = groupNotesByInstrument(notes);
  const commands: PianoRollCommand[] = [];

  for (const [instrumentId, instrumentNotes] of notesByInstrument) {
    const changes: NotePositionChange[] = [];

    for (const note of instrumentNotes) {
      changes.push({
        noteId: note.id,
        startTick: note.startTick,
        pitch: note.pitch,
      });
    }

    commands.push({
      type: "RepositionNotes",
      clipId,
      trackInstrumentId: instrumentId,
      changes,
    });
  }

  return commands;
}

/** Creates resize commands from the original notes and a shared delta. */
export function buildResizeNoteCommands(
  clipId: ClipId,
  notes: readonly Note[],
  deltaTicks: number,
  edge: NoteResizeEdge,
): readonly PianoRollCommand[] {
  const notesByInstrument = groupNotesByInstrument(notes);
  const commands: PianoRollCommand[] = [];

  for (const [instrumentId, instrumentNotes] of notesByInstrument) {
    const changes: NoteDurationChange[] = [];

    for (const note of instrumentNotes) {
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
      clipId,
      trackInstrumentId: instrumentId,
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

function groupNotesByInstrument(
  notes: readonly Note[],
): ReadonlyMap<InstrumentId, readonly Note[]> {
  const notesByInstrument = new Map<InstrumentId, Note[]>();

  for (const note of notes) {
    let instrumentNotes = notesByInstrument.get(note.instrumentId);

    if (instrumentNotes === undefined) {
      instrumentNotes = [];
      notesByInstrument.set(note.instrumentId, instrumentNotes);
    }

    instrumentNotes.push(note);
  }

  return notesByInstrument;
}
