import {
  PROJECT_CONSTANTS,
} from "../../config/domain-limits";
import type {
  InstrumentId,
  NoteId,
  Tick,
} from "../identifiers";

export type MidiPitch = number;
export type MidiVelocity = number;

export const MAXIMUM_CLIP_NOTE_COUNT =
  PROJECT_CONSTANTS.maximumNoteCount;

export interface Note {
  readonly id: NoteId;
  readonly pitch: MidiPitch;
  readonly startTick: Tick;
  readonly durationTicks: Tick;
  readonly velocity: MidiVelocity;
  readonly instrumentId: InstrumentId;
  readonly enabled: boolean;
}
