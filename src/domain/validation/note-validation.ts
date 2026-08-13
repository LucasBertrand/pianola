import {
  type InstrumentId,
  type Tick,
} from "../identifiers";
import {
  type MidiPitch,
  type MidiVelocity,
  type Note,
} from "../notes/note";
import {
  type Track,
} from "../clips/clip";
import {
  MAXIMUM_ENTITY_ID_LENGTH,
} from "../identifiers";
import {
  assertValidationResult,
  type ValidationIssue,
  type ValidationResult,
} from "./validation-result";

export function isValidMidiPitch(pitch: MidiPitch): boolean {
  return Number.isInteger(pitch) && pitch >= 0 && pitch <= 127;
}

export function isValidMidiVelocity(velocity: MidiVelocity): boolean {
  return Number.isInteger(velocity) && velocity >= 0 && velocity <= 127;
}

export function isValidTick(tick: Tick): boolean {
  return Number.isSafeInteger(tick) && tick >= 0;
}

export function isValidDuration(durationTicks: Tick): boolean {
  return Number.isSafeInteger(durationTicks) && durationTicks > 0;
}

export function validateNote(note: Note): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (
    note.id.trim().length === 0
    || note.id.length > MAXIMUM_ENTITY_ID_LENGTH
  ) {
    issues.push({
      code:
        note.id.trim().length === 0
          ? "EMPTY_ID"
          : "INVALID_ID",
      path: "id",
      message:
        `Note ID must contain between 1 and ${MAXIMUM_ENTITY_ID_LENGTH} characters.`,
    });
  }

  if (
    note.instrumentId.trim().length === 0
    || note.instrumentId.length > MAXIMUM_ENTITY_ID_LENGTH
  ) {
    issues.push({
      code:
        note.instrumentId.trim().length === 0
          ? "EMPTY_ID"
          : "INVALID_ID",
      path: "instrumentId",
      message:
        `ProjectInstrument ID must contain between 1 and ${MAXIMUM_ENTITY_ID_LENGTH} characters.`,
    });
  }

  if (!isValidMidiPitch(note.pitch)) {
    issues.push({
      code: "INVALID_PITCH",
      path: "pitch",
      message: "Pitch must be an integer between 0 and 127.",
    });
  }

  if (!isValidMidiVelocity(note.velocity)) {
    issues.push({
      code: "INVALID_VELOCITY",
      path: "velocity",
      message: "Velocity must be an integer between 0 and 127.",
    });
  }

  if (!isValidTick(note.startTick)) {
    issues.push({
      code: "INVALID_START_TICK",
      path: "startTick",
      message: "Start tick must be a non-negative safe integer.",
    });
  }

  if (!isValidDuration(note.durationTicks)) {
    issues.push({
      code: "INVALID_DURATION",
      path: "durationTicks",
      message: "Duration must be a positive safe integer.",
    });
  }

  if (typeof note.enabled !== "boolean") {
    issues.push({
      code: "INVALID_NOTE_ENABLED",
      path: "enabled",
      message: "Note enabled state must be a boolean.",
    });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateNoteForTrack(
  note: Note,
  trackInstrumentId: InstrumentId,
): ValidationResult {
  const issues = [...validateNote(note).issues];

  if (note.instrumentId !== trackInstrumentId) {
    issues.push({
      code: "INSTRUMENT_TRACK_MISMATCH",
      path: "instrumentId",
      message: `Note instrument ID "${note.instrumentId}" must match track instrument ID "${trackInstrumentId}".`,
    });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateTrack(track: Track): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (
    track.instrumentId.trim().length === 0
    || track.instrumentId.length > MAXIMUM_ENTITY_ID_LENGTH
  ) {
    issues.push({
      code:
        track.instrumentId.trim().length === 0
          ? "EMPTY_ID"
          : "INVALID_ID",
      path: "instrumentId",
      message:
        `Track instrument ID must contain between 1 and ${MAXIMUM_ENTITY_ID_LENGTH} characters.`,
    });
  }

  for (const [noteId, note] of Object.entries(track.notesById)) {
    for (const issue of validateNoteForTrack(note, track.instrumentId).issues) {
      issues.push({
        ...issue,
        path: `notesById.${noteId}.${issue.path}`,
      });
    }

    if (note.id !== noteId) {
      issues.push({
        code: "NOTE_KEY_MISMATCH",
        path: `notesById.${noteId}.id`,
        message: `Note ID "${note.id}" must match its record key "${noteId}".`,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function assertValidNoteForTrack(
  note: Note,
  trackInstrumentId: InstrumentId,
): void {
  assertValidationResult(validateNoteForTrack(note, trackInstrumentId));
}

export function assertValidTrack(track: Track): void {
  assertValidationResult(validateTrack(track));
}

