import type {
  MidiPitch,
  MidiVelocity,
  Note,
  Tick,
  Track,
  TransportState,
  VoiceId,
} from "./model";

export type ValidationCode =
  | "EMPTY_ID"
  | "INVALID_PITCH"
  | "INVALID_VELOCITY"
  | "INVALID_START_TICK"
  | "INVALID_DURATION"
  | "VOICE_TRACK_MISMATCH"
  | "NOTE_KEY_MISMATCH"
  | "INVALID_BPM"
  | "INVALID_PPQN"
  | "INVALID_TIME_SIGNATURE"
  | "INVALID_LOOP"
  | "INVALID_TRANSPORT_ANCHOR";

export interface ValidationIssue {
  readonly code: ValidationCode;
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

export class DomainValidationError extends Error {
  public readonly issues: readonly ValidationIssue[];

  public constructor(issues: readonly ValidationIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "DomainValidationError";
    this.issues = Object.freeze([...issues]);
  }
}

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

  if (note.id.trim().length === 0) {
    issues.push({
      code: "EMPTY_ID",
      path: "id",
      message: "Note ID must not be empty.",
    });
  }

  if (note.voiceId.trim().length === 0) {
    issues.push({
      code: "EMPTY_ID",
      path: "voiceId",
      message: "Voice ID must not be empty.",
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

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateNoteForTrack(
  note: Note,
  trackVoiceId: VoiceId,
): ValidationResult {
  const issues = [...validateNote(note).issues];

  if (note.voiceId !== trackVoiceId) {
    issues.push({
      code: "VOICE_TRACK_MISMATCH",
      path: "voiceId",
      message: `Note voice ID "${note.voiceId}" must match track voice ID "${trackVoiceId}".`,
    });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateTrack(track: Track): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (track.voiceId.trim().length === 0) {
    issues.push({
      code: "EMPTY_ID",
      path: "voiceId",
      message: "Track voice ID must not be empty.",
    });
  }

  for (const [noteId, note] of Object.entries(track.notesById)) {
    for (const issue of validateNoteForTrack(note, track.voiceId).issues) {
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

export function validateTransportState(
  transport: TransportState,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!Number.isFinite(transport.bpm) || transport.bpm <= 0) {
    issues.push({
      code: "INVALID_BPM",
      path: "bpm",
      message: "BPM must be a positive finite number.",
    });
  }

  if (!Number.isSafeInteger(transport.ppqn) || transport.ppqn <= 0) {
    issues.push({
      code: "INVALID_PPQN",
      path: "ppqn",
      message: "PPQN must be a positive safe integer.",
    });
  }

  if (
    !Number.isSafeInteger(transport.timeSignature.numerator)
    || transport.timeSignature.numerator <= 0
    || ![1, 2, 4, 8, 16, 32].includes(
      transport.timeSignature.denominator,
    )
  ) {
    issues.push({
      code: "INVALID_TIME_SIGNATURE",
      path: "timeSignature",
      message: "Time signature must have a positive numerator and a supported denominator.",
    });
  }

  if (
    transport.loop !== null
    && (
      !isValidTick(transport.loop.startTick)
      || !isValidTick(transport.loop.endTick)
      || transport.loop.startTick >= transport.loop.endTick
    )
  ) {
    issues.push({
      code: "INVALID_LOOP",
      path: "loop",
      message: "Loop start must be non-negative and strictly lower than loop end.",
    });
  }

  if (
    !isValidTick(transport.anchorTick)
    || (
      transport.anchorAudioTimeSeconds !== null
      && (
        !Number.isFinite(transport.anchorAudioTimeSeconds)
        || transport.anchorAudioTimeSeconds < 0
      )
    )
  ) {
    issues.push({
      code: "INVALID_TRANSPORT_ANCHOR",
      path: "anchorTick",
      message: "Transport anchor values must be non-negative and finite.",
    });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function assertValidNoteForTrack(
  note: Note,
  trackVoiceId: VoiceId,
): void {
  assertValidationResult(validateNoteForTrack(note, trackVoiceId));
}

export function assertValidTrack(track: Track): void {
  assertValidationResult(validateTrack(track));
}

export function assertValidTransportState(transport: TransportState): void {
  assertValidationResult(validateTransportState(transport));
}

export function assertValidationResult(result: ValidationResult): void {
  if (!result.valid) {
    throw new DomainValidationError(result.issues);
  }
}
