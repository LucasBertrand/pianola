import {
  PROJECT_CONSTANTS,
} from "../project/project-constants";
import type {
  InstrumentId,
  NoteId,
  Tick,
} from "../identifiers";

export type MidiPitch = number;
export type MidiVelocity = number;

export function isNoteAudible(note: Pick<Note, "muted">): boolean {
  return !note.muted;
}

export function isNoteEditable(note: Pick<Note, "locked">): boolean {
  return !note.locked;
}

export const MAXIMUM_CLIP_NOTE_COUNT =
  PROJECT_CONSTANTS.maximumNoteCount;

export interface Note {
  readonly id: NoteId;
  readonly pitch: MidiPitch;
  readonly startTick: Tick;
  readonly durationTicks: Tick;
  readonly velocity: MidiVelocity;
  readonly instrumentId: InstrumentId;
  readonly muted: boolean;
  readonly locked: boolean;
}
