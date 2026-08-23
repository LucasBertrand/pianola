import {
  type Clip,
  type Track,
} from "../clips/clip";
import {
  type InstrumentId,
  type NoteId,
} from "../identifiers";
import {
  type Note,
} from "../notes/note";
import {
  type ProjectInstrument,
} from "../instruments/instrument";
import {
  type ProjectState,
} from "../project/project-document";
import {
  type TransportState,
} from "../transport/transport";
import { assertValidClipTimeline } from "../validation/transport-validation";
import type { ActiveClipProjectState } from "./active-clip-project-state";
import { CommandRejectedError } from "./command-errors";
import type { CommandErrorCode } from "./command-errors";
import type { PianoRollCommand } from "./command-types";

export function requireProjectInstrument(
  state: Pick<ProjectState, "projectInstrumentsById">,
  instrumentId: InstrumentId,
  commandType: PianoRollCommand["type"],
): ProjectInstrument {
  const instrument = state.projectInstrumentsById[instrumentId];

  if (instrument === undefined) {
    reject(
      "INSTRUMENT_NOT_FOUND",
      `ProjectInstrument "${instrumentId}" does not exist.`,
      commandType,
    );
  }

  return instrument;
}

export function requireTrack(
  state: ActiveClipProjectState,
  instrumentId: InstrumentId,
  commandType: PianoRollCommand["type"],
): Track {
  const track = state.tracksByInstrumentId[instrumentId];

  if (track === undefined) {
    reject(
      "TRACK_NOT_FOUND",
      `Track "${instrumentId}" does not exist.`,
      commandType,
    );
  }

  return track;
}

export function assertProjectInstrumentEditable(
  state: Pick<ProjectState, "projectInstrumentsById"> & Pick<Clip, "instrumentStatesById">,
  instrumentId: InstrumentId,
  commandType: PianoRollCommand["type"],
): void {
  requireProjectInstrument(state, instrumentId, commandType);

  if (state.instrumentStatesById[instrumentId]?.locked !== false) {
    reject(
      "INSTRUMENT_LOCKED",
      `ProjectInstrument "${instrumentId}" is locked.`,
      commandType,
    );
  }
}

export function requireNote(
  track: Track,
  noteId: NoteId,
  commandType: PianoRollCommand["type"],
): Note {
  const note = track.notesById[noteId];

  if (note === undefined) {
    reject(
      "NOTE_NOT_FOUND",
      `Note "${noteId}" does not exist in track "${track.instrumentId}".`,
      commandType,
    );
  }

  return note;
}

export function findNoteInstrumentId(
  state: ActiveClipProjectState,
  noteId: NoteId,
): InstrumentId | undefined {
  for (const instrumentId in state.tracksByInstrumentId) {
    const track = state.tracksByInstrumentId[instrumentId];

    if (
      track !== undefined
      && hasOwn(track.notesById, noteId)
    ) {
      return instrumentId;
    }
  }

  return undefined;
}

export function countClipNotes(state: ActiveClipProjectState): number {
  let noteCount = 0;

  for (const instrumentId in state.tracksByInstrumentId) {
    const track = state.tracksByInstrumentId[instrumentId];

    if (track !== undefined) {
      noteCount += Object.keys(track.notesById).length;
    }
  }

  return noteCount;
}

export function assertTransportWithinProjectDuration(
  state: ActiveClipProjectState,
  transport: TransportState,
  commandType: PianoRollCommand["type"],
): void {
  assertValidClipTimeline(state.timeline, state.clock);
  const projectDurationTicks = state.timeline.durationTicks;

  if (transport.loop.endTick > projectDurationTicks) {
    reject(
      "INVALID_COMMAND",
      "Loop region cannot exceed the clip duration.",
      commandType,
    );
  }
}

export function assertUniqueNoteIds(
  noteIds: readonly NoteId[],
  commandType: PianoRollCommand["type"],
): void {
  const uniqueIds = new Set(noteIds);

  if (uniqueIds.size !== noteIds.length) {
    reject(
      "DUPLICATE_NOTE_ID",
      "A note ID appears more than once in the command.",
      commandType,
    );
  }
}

export function omitRecordKey<T>(
  source: Readonly<Record<string, T>>,
  keyToOmit: string,
): Readonly<Record<string, T>> {
  const result: Record<string, T> = {};

  for (const [key, value] of Object.entries(source)) {
    if (key !== keyToOmit) {
      result[key] = value;
    }
  }

  return result;
}

export function hasOwn<T>(
  record: Readonly<Record<string, T>>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function reject(
  code: CommandErrorCode,
  message: string,
  commandType: PianoRollCommand["type"],
): never {
  throw new CommandRejectedError(code, message, commandType);
}

export function assertNever(value: never): never {
  throw new CommandRejectedError(
    "INVALID_COMMAND",
    `Unsupported command: ${String(value)}`,
    null,
  );
}
