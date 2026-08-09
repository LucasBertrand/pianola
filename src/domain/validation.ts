import type {
  MidiPitch,
  MidiVelocity,
  Note,
  Tick,
  Track,
  TransportState,
  Voice,
  VoiceId,
} from "./model";
import {
  getTicksPerMeasure,
  MAXIMUM_INSTRUMENT_POLYPHONY,
  MAXIMUM_DESCRIPTOR_PARAMETER_COUNT,
  MAXIMUM_ENTITY_ID_LENGTH,
  MAXIMUM_VOICE_DESCRIPTOR_COUNT,
  MAXIMUM_VOICE_NAME_LENGTH,
  MINIMUM_INSTRUMENT_POLYPHONY,
} from "./model";

export type ValidationCode =
  | "EMPTY_ID"
  | "INVALID_ID"
  | "INVALID_PITCH"
  | "INVALID_VELOCITY"
  | "INVALID_START_TICK"
  | "INVALID_DURATION"
  | "INVALID_NOTE_ENABLED"
  | "VOICE_TRACK_MISMATCH"
  | "NOTE_KEY_MISMATCH"
  | "INVALID_VOICE"
  | "INVALID_BPM"
  | "INVALID_PPQN"
  | "INVALID_TIME_SIGNATURE"
  | "INVALID_LOOP"
  | "INVALID_TRANSPORT_ANCHOR"
  | "INVALID_PROJECT_DURATION";

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
    note.voiceId.trim().length === 0
    || note.voiceId.length > MAXIMUM_ENTITY_ID_LENGTH
  ) {
    issues.push({
      code:
        note.voiceId.trim().length === 0
          ? "EMPTY_ID"
          : "INVALID_ID",
      path: "voiceId",
      message:
        `Voice ID must contain between 1 and ${MAXIMUM_ENTITY_ID_LENGTH} characters.`,
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

  if (
    track.voiceId.trim().length === 0
    || track.voiceId.length > MAXIMUM_ENTITY_ID_LENGTH
  ) {
    issues.push({
      code:
        track.voiceId.trim().length === 0
          ? "EMPTY_ID"
          : "INVALID_ID",
      path: "voiceId",
      message:
        `Track voice ID must contain between 1 and ${MAXIMUM_ENTITY_ID_LENGTH} characters.`,
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

export function validateVoice(voice: Voice): ValidationResult {
  const issues: ValidationIssue[] = [];

  validateBoundedIdentifier(voice.id, "id", "Voice ID", issues);

  if (
    voice.name.trim().length === 0
    || voice.name.length > MAXIMUM_VOICE_NAME_LENGTH
  ) {
    pushVoiceIssue(
      issues,
      "name",
      `Voice name must contain between 1 and ${MAXIMUM_VOICE_NAME_LENGTH} characters.`,
    );
  }

  if (!/^#[0-9a-f]{6}$/i.test(voice.color)) {
    pushVoiceIssue(
      issues,
      "color",
      "Voice color must use the #RRGGBB format.",
    );
  }

  if (
    typeof voice.muted !== "boolean"
    || typeof voice.locked !== "boolean"
    || typeof voice.solo !== "boolean"
  ) {
    pushVoiceIssue(
      issues,
      "state",
      "Voice mute, lock, and solo states must be booleans.",
    );
  }

  if (!Number.isFinite(voice.gain)) {
    pushVoiceIssue(issues, "gain", "Voice gain must be finite.");
  }

  if (
    !Number.isFinite(voice.pan)
    || voice.pan < -1
    || voice.pan > 1
  ) {
    pushVoiceIssue(
      issues,
      "pan",
      "Voice pan must be a finite number between -1 and 1.",
    );
  }

  validateInstrument(voice, issues);
  validateDescriptors(voice.effects, "effects", issues);
  validateDescriptors(
    voice.generativeRules,
    "generativeRules",
    issues,
  );
  validateVoiceInterpretation(voice, issues);

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
    !isValidTick(transport.loop.startTick)
    || !isValidTick(transport.loop.endTick)
    || transport.loop.startTick >= transport.loop.endTick
  ) {
    issues.push({
      code: "INVALID_LOOP",
      path: "loop",
      message: "Loop start must be non-negative and strictly lower than loop end.",
    });
  }

  if (typeof transport.loopEnabled !== "boolean") {
    issues.push({
      code: "INVALID_LOOP",
      path: "loopEnabled",
      message: "Loop enabled state must be a boolean.",
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

export function validateProjectDuration(
  measureCount: number,
  transport: TransportState,
): ValidationResult {
  const ticksPerMeasure = getTicksPerMeasure(transport);
  const projectDurationTicks = measureCount * ticksPerMeasure;
  const valid =
    Number.isSafeInteger(measureCount)
    && measureCount > 0
    && Number.isSafeInteger(ticksPerMeasure)
    && ticksPerMeasure > 0
    && Number.isSafeInteger(projectDurationTicks)
    && projectDurationTicks > 0;

  return {
    valid,
    issues: valid
      ? []
      : [{
          code: "INVALID_PROJECT_DURATION",
          path: "measureCount",
          message:
            "Project duration must resolve to a positive safe integer number of ticks.",
        }],
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

export function assertValidVoice(voice: Voice): void {
  assertValidationResult(validateVoice(voice));
}

export function assertValidTransportState(transport: TransportState): void {
  assertValidationResult(validateTransportState(transport));
}

export function assertValidProjectDuration(
  measureCount: number,
  transport: TransportState,
): void {
  assertValidationResult(
    validateProjectDuration(measureCount, transport),
  );
}

export function assertValidationResult(result: ValidationResult): void {
  if (!result.valid) {
    throw new DomainValidationError(result.issues);
  }
}

function validateBoundedIdentifier(
  value: string,
  path: string,
  label: string,
  issues: ValidationIssue[],
): void {
  if (
    value.trim().length === 0
    || value.length > MAXIMUM_ENTITY_ID_LENGTH
  ) {
    issues.push({
      code: value.trim().length === 0 ? "EMPTY_ID" : "INVALID_ID",
      path,
      message:
        `${label} must contain between 1 and ${MAXIMUM_ENTITY_ID_LENGTH} characters.`,
    });
  }
}

function pushVoiceIssue(
  issues: ValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({
    code: "INVALID_VOICE",
    path,
    message,
  });
}

function validateInstrument(
  voice: Voice,
  issues: ValidationIssue[],
): void {
  const instrument = voice.instrument;

  validateWaveform(
    instrument.oscillatorWaveform,
    "instrument.oscillatorWaveform",
    issues,
  );
  if (
    !Number.isSafeInteger(instrument.polyphony)
    || instrument.polyphony < MINIMUM_INSTRUMENT_POLYPHONY
    || instrument.polyphony > MAXIMUM_INSTRUMENT_POLYPHONY
  ) {
    pushVoiceIssue(
      issues,
      "instrument.polyphony",
      `Instrument polyphony must be an integer between ${MINIMUM_INSTRUMENT_POLYPHONY} and ${MAXIMUM_INSTRUMENT_POLYPHONY}.`,
    );
  }
  validateFiniteNumber(
    instrument.oscillatorDetuneCents,
    "instrument.oscillatorDetuneCents",
    issues,
  );
  validateEnvelope(instrument.envelope, "instrument.envelope", issues);
  validatePositiveNumber(
    instrument.filterCutoffHz,
    "instrument.filterCutoffHz",
    issues,
  );
  validateNonNegativeNumber(
    instrument.filterResonance,
    "instrument.filterResonance",
    issues,
  );
}

function validateEnvelope(
  envelope: Voice["instrument"]["envelope"],
  path: string,
  issues: ValidationIssue[],
): void {
  validateNonNegativeNumber(
    envelope.attackSeconds,
    `${path}.attackSeconds`,
    issues,
  );
  validateNonNegativeNumber(
    envelope.decaySeconds,
    `${path}.decaySeconds`,
    issues,
  );

  if (
    !Number.isFinite(envelope.sustainLevel)
    || envelope.sustainLevel < 0
    || envelope.sustainLevel > 1
  ) {
    pushVoiceIssue(
      issues,
      `${path}.sustainLevel`,
      "Envelope sustain level must be between 0 and 1.",
    );
  }

  validateNonNegativeNumber(
    envelope.releaseSeconds,
    `${path}.releaseSeconds`,
    issues,
  );
}

function validateWaveform(
  waveform: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (
    waveform !== "sine"
    && waveform !== "square"
    && waveform !== "sawtooth"
    && waveform !== "triangle"
  ) {
    pushVoiceIssue(issues, path, "Oscillator waveform is not supported.");
  }
}

function validateDescriptors(
  descriptors: Voice["effects"] | Voice["generativeRules"],
  path: string,
  issues: ValidationIssue[],
): void {
  if (descriptors.length > MAXIMUM_VOICE_DESCRIPTOR_COUNT) {
    pushVoiceIssue(
      issues,
      path,
      `A voice cannot contain more than ${MAXIMUM_VOICE_DESCRIPTOR_COUNT} descriptors of one type.`,
    );
  }

  const ids = new Set<string>();

  for (
    let descriptorIndex = 0;
    descriptorIndex < descriptors.length;
    descriptorIndex += 1
  ) {
    const descriptor = descriptors[descriptorIndex];

    if (descriptor === undefined) {
      continue;
    }

    const descriptorPath = `${path}[${descriptorIndex}]`;
    validateBoundedIdentifier(
      descriptor.id,
      `${descriptorPath}.id`,
      "Descriptor ID",
      issues,
    );

    if (ids.has(descriptor.id)) {
      pushVoiceIssue(
        issues,
        `${descriptorPath}.id`,
        `Descriptor ID "${descriptor.id}" appears more than once.`,
      );
    }

    ids.add(descriptor.id);

    if (
      descriptor.kind.trim().length === 0
      || descriptor.kind.length > MAXIMUM_VOICE_NAME_LENGTH
    ) {
      pushVoiceIssue(
        issues,
        `${descriptorPath}.kind`,
        "Descriptor kind must be non-empty and bounded.",
      );
    }

    if (typeof descriptor.enabled !== "boolean") {
      pushVoiceIssue(
        issues,
        `${descriptorPath}.enabled`,
        "Descriptor enabled state must be a boolean.",
      );
    }

    validateDescriptorParameters(
      descriptor.parameters,
      `${descriptorPath}.parameters`,
      issues,
    );
  }
}

function validateDescriptorParameters(
  parameters: Readonly<Record<string, unknown>>,
  path: string,
  issues: ValidationIssue[],
): void {
  const entries = Object.entries(parameters);

  if (entries.length > MAXIMUM_DESCRIPTOR_PARAMETER_COUNT) {
    pushVoiceIssue(
      issues,
      path,
      `A descriptor cannot contain more than ${MAXIMUM_DESCRIPTOR_PARAMETER_COUNT} parameters.`,
    );
  }

  for (const [key, value] of entries) {
    if (
      key.length === 0
      || key.length > MAXIMUM_VOICE_NAME_LENGTH
    ) {
      pushVoiceIssue(
        issues,
        `${path}.${key}`,
        "Parameter names must be non-empty and bounded.",
      );
    }

    if (
      typeof value !== "string"
      && typeof value !== "number"
      && typeof value !== "boolean"
    ) {
      pushVoiceIssue(
        issues,
        `${path}.${key}`,
        "Parameters must be strings, finite numbers, or booleans.",
      );
    } else if (typeof value === "number" && !Number.isFinite(value)) {
      pushVoiceIssue(
        issues,
        `${path}.${key}`,
        "Numeric parameters must be finite.",
      );
    }
  }
}

function validateVoiceInterpretation(
  voice: Voice,
  issues: ValidationIssue[],
): void {
  const interpretation = voice.interpretation;

  if (!Number.isSafeInteger(interpretation.transposeSemitones)) {
    pushVoiceIssue(
      issues,
      "interpretation.transposeSemitones",
      "Voice transposition must be a safe integer.",
    );
  }

  if (!Number.isSafeInteger(interpretation.timingOffsetTicks)) {
    pushVoiceIssue(
      issues,
      "interpretation.timingOffsetTicks",
      "Voice timing offset must be a safe integer.",
    );
  }

  validatePositiveNumber(
    interpretation.gateRatio,
    "interpretation.gateRatio",
    issues,
  );
  validateNonNegativeNumber(
    interpretation.velocityScale,
    "interpretation.velocityScale",
    issues,
  );

  if (
    !Number.isFinite(interpretation.probability)
    || interpretation.probability < 0
    || interpretation.probability > 1
  ) {
    pushVoiceIssue(
      issues,
      "interpretation.probability",
      "Voice probability must be between 0 and 1.",
    );
  }
}

function validateFiniteNumber(
  value: number,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Number.isFinite(value)) {
    pushVoiceIssue(issues, path, "Value must be finite.");
  }
}

function validatePositiveNumber(
  value: number,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Number.isFinite(value) || value <= 0) {
    pushVoiceIssue(issues, path, "Value must be positive and finite.");
  }
}

function validateNonNegativeNumber(
  value: number,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Number.isFinite(value) || value < 0) {
    pushVoiceIssue(
      issues,
      path,
      "Value must be non-negative and finite.",
    );
  }
}
