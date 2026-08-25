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
export type NoteStatus = "active" | "muted" | "locked" | "disabled";

export const NOTE_STATUSES: readonly NoteStatus[] = [
  "active",
  "muted",
  "locked",
  "disabled",
];

export function isNoteStatus(value: unknown): value is NoteStatus {
  return typeof value === "string"
    && NOTE_STATUSES.includes(value as NoteStatus);
}

export function isNoteAudible(note: Pick<Note, "status">): boolean {
  return note.status === "active" || note.status === "locked";
}

export function isNoteEditable(note: Pick<Note, "status">): boolean {
  return note.status === "active" || note.status === "muted";
}

export function setNoteMuted(
  status: NoteStatus,
  muted: boolean,
): NoteStatus {
  if (muted) {
    return status === "locked" || status === "disabled" ? "disabled" : "muted";
  }

  return status === "locked" || status === "disabled" ? "locked" : "active";
}

export function setNoteLocked(
  status: NoteStatus,
  locked: boolean,
): NoteStatus {
  if (locked) {
    return status === "muted" || status === "disabled" ? "disabled" : "locked";
  }

  return status === "muted" || status === "disabled" ? "muted" : "active";
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
  readonly status: NoteStatus;
}
