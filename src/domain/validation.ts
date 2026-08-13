import type {
  AdsrEnvelope,
  InstrumentConfig,
  InstrumentPreset,
  MidiPitch,
  MidiVelocity,
  Note,
  Tick,
  Track,
  TransportState,
  ProjectInstrument,
  InstrumentId,
} from "./model";
import {
  INSTRUMENT_CONSTANTS,
} from "../config/domain-limits";
import {
  getTicksPerMeasure,
  MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
  MAXIMUM_DESCRIPTOR_PARAMETER_COUNT,
  MAXIMUM_ENTITY_ID_LENGTH,
  MAXIMUM_INSTRUMENT_DESCRIPTOR_COUNT,
  MAXIMUM_INSTRUMENT_NAME_LENGTH,
  MAXIMUM_MASTER_GAIN,
  MINIMUM_MASTER_GAIN,
  MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
} from "./model";

export type ValidationCode =
  | "EMPTY_ID"
  | "INVALID_ID"
  | "INVALID_PITCH"
  | "INVALID_VELOCITY"
  | "INVALID_START_TICK"
  | "INVALID_DURATION"
  | "INVALID_NOTE_ENABLED"
  | "INSTRUMENT_TRACK_MISMATCH"
  | "NOTE_KEY_MISMATCH"
  | "INVALID_INSTRUMENT"
  | "INVALID_PRESET"
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

export function validateProjectInstrument(instrument: ProjectInstrument): ValidationResult {
  const issues: ValidationIssue[] = [];

  validateBoundedIdentifier(instrument.id, "id", "ProjectInstrument ID", issues);
  validateBoundedIdentifier(
    instrument.instrument.kind,
    "instrument.kind",
    "Instrument engine kind",
    issues,
  );

  if (
    instrument.name.trim().length === 0
    || instrument.name.length > MAXIMUM_INSTRUMENT_NAME_LENGTH
  ) {
    pushProjectInstrumentIssue(
      issues,
      "name",
      `ProjectInstrument name must contain between 1 and ${MAXIMUM_INSTRUMENT_NAME_LENGTH} characters.`,
    );
  }

  if (!/^#[0-9a-f]{6}$/i.test(instrument.color)) {
    pushProjectInstrumentIssue(
      issues,
      "color",
      "ProjectInstrument color must use the #RRGGBB format.",
    );
  }

  if (
    !Number.isFinite(instrument.gain)
    || instrument.gain < MINIMUM_MASTER_GAIN
    || instrument.gain > MAXIMUM_MASTER_GAIN
  ) {
    pushProjectInstrumentIssue(
      issues,
      "gain",
      `ProjectInstrument gain must be between ${MINIMUM_MASTER_GAIN} and ${MAXIMUM_MASTER_GAIN}.`,
    );
  }

  if (typeof instrument.muted !== "boolean") {
    pushProjectInstrumentIssue(issues, "muted", "ProjectInstrument muted must be boolean.");
  }

  if (typeof instrument.solo !== "boolean") {
    pushProjectInstrumentIssue(issues, "solo", "ProjectInstrument solo must be boolean.");
  }

  const instrumentValidation = validateInstrumentConfig(instrument.instrument);

  for (const issue of instrumentValidation.issues) {
    issues.push({
      ...issue,
      path: `instrument.${issue.path}`,
    });
  }

  if (
    !Number.isFinite(instrument.pan)
    || instrument.pan < -1
    || instrument.pan > 1
  ) {
    pushProjectInstrumentIssue(
      issues,
      "pan",
      "ProjectInstrument pan must be a finite number between -1 and 1.",
    );
  }

  validateDescriptors(instrument.effects, "effects", issues);
  validateDescriptors(
    instrument.generativeRules,
    "generativeRules",
    issues,
  );
  validateProjectInstrumentInterpretation(instrument, issues);

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateInstrumentConfig(
  instrument: InstrumentConfig,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  validateInstrument(instrument, issues);

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateInstrumentPreset(
  preset: InstrumentPreset,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  validateBoundedIdentifier(preset.id, "id", "Preset ID", issues);

  if (
    preset.name.trim().length === 0
    || preset.name.length > MAXIMUM_INSTRUMENT_NAME_LENGTH
  ) {
    issues.push({
      code: "INVALID_PRESET",
      path: "name",
      message:
        `Preset name must contain between 1 and ${MAXIMUM_INSTRUMENT_NAME_LENGTH} characters.`,
    });
  }

  if (preset.kind !== preset.config.kind) {
    issues.push({
      code: "INVALID_PRESET",
      path: "kind",
      message: "Preset kind must match its instrument configuration kind.",
    });
  }

  const configValidation = validateInstrumentConfig(preset.config);

  for (const issue of configValidation.issues) {
    issues.push({
      ...issue,
      code: "INVALID_PRESET",
      path: `config.${issue.path}`,
    });
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
  trackInstrumentId: InstrumentId,
): void {
  assertValidationResult(validateNoteForTrack(note, trackInstrumentId));
}

export function assertValidTrack(track: Track): void {
  assertValidationResult(validateTrack(track));
}

export function assertValidProjectInstrument(instrument: ProjectInstrument): void {
  assertValidationResult(validateProjectInstrument(instrument));
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

function pushProjectInstrumentIssue(
  issues: ValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({
    code: "INVALID_INSTRUMENT",
    path,
    message,
  });
}

function validateInstrument(
  instrument: InstrumentConfig,
  issues: ValidationIssue[],
): void {
  validateWaveform(
    instrument.oscillatorWaveform,
    "instrument.oscillatorWaveform",
    issues,
  );
  if (
    !Number.isSafeInteger(instrument.polyphony)
    || instrument.polyphony < MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY
    || instrument.polyphony > MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY
  ) {
    pushProjectInstrumentIssue(
      issues,
      "instrument.polyphony",
      `Subtractive synth polyphony must be an integer between ${MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY} and ${MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY}.`,
    );
  }
  validateFiniteNumber(
    instrument.oscillatorDetuneCents,
    "instrument.oscillatorDetuneCents",
    issues,
  );
  validateNumberInRange(
    instrument.pulseWidth,
    "instrument.pulseWidth",
    INSTRUMENT_CONSTANTS.minimumPulseWidth,
    INSTRUMENT_CONSTANTS.maximumPulseWidth,
    issues,
  );
  validateEnvelope(instrument.envelope, "instrument.envelope", issues);
  validateNumberInRange(
    instrument.filterCutoffHz,
    "instrument.filterCutoffHz",
    INSTRUMENT_CONSTANTS.minimumFilterCutoffHz,
    INSTRUMENT_CONSTANTS.maximumFilterCutoffHz,
    issues,
  );
  validateNumberInRange(
    instrument.filterResonance,
    "instrument.filterResonance",
    INSTRUMENT_CONSTANTS.minimumFilterResonance,
    INSTRUMENT_CONSTANTS.maximumFilterResonance,
    issues,
  );
  validateNumberInRange(
    instrument.filterEnvelopeAmountOctaves,
    "instrument.filterEnvelopeAmountOctaves",
    INSTRUMENT_CONSTANTS.minimumFilterEnvelopeAmountOctaves,
    INSTRUMENT_CONSTANTS.maximumFilterEnvelopeAmountOctaves,
    issues,
  );
  validateEnvelope(
    instrument.filterEnvelope,
    "instrument.filterEnvelope",
    issues,
  );
}

function validateEnvelope(
  envelope: AdsrEnvelope,
  path: string,
  issues: ValidationIssue[],
): void {
  validateNumberInRange(
    envelope.attackSeconds,
    `${path}.attackSeconds`,
    0,
    INSTRUMENT_CONSTANTS.maximumEnvelopeTimeSeconds,
    issues,
  );
  validateNumberInRange(
    envelope.decaySeconds,
    `${path}.decaySeconds`,
    0,
    INSTRUMENT_CONSTANTS.maximumEnvelopeDecaySeconds,
    issues,
  );

  if (
    !Number.isFinite(envelope.sustainLevel)
    || envelope.sustainLevel < 0
    || envelope.sustainLevel > 1
  ) {
    pushProjectInstrumentIssue(
      issues,
      `${path}.sustainLevel`,
      "Envelope sustain level must be between 0 and 1.",
    );
  }

  validateNumberInRange(
    envelope.releaseSeconds,
    `${path}.releaseSeconds`,
    0,
    INSTRUMENT_CONSTANTS.maximumEnvelopeTimeSeconds,
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
    pushProjectInstrumentIssue(issues, path, "Oscillator waveform is not supported.");
  }
}

function validateDescriptors(
  descriptors: ProjectInstrument["effects"] | ProjectInstrument["generativeRules"],
  path: string,
  issues: ValidationIssue[],
): void {
  if (descriptors.length > MAXIMUM_INSTRUMENT_DESCRIPTOR_COUNT) {
    pushProjectInstrumentIssue(
      issues,
      path,
      `An instrument cannot contain more than ${MAXIMUM_INSTRUMENT_DESCRIPTOR_COUNT} descriptors of one type.`,
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
      pushProjectInstrumentIssue(
        issues,
        `${descriptorPath}.id`,
        `Descriptor ID "${descriptor.id}" appears more than once.`,
      );
    }

    ids.add(descriptor.id);

    if (
      descriptor.kind.trim().length === 0
      || descriptor.kind.length > MAXIMUM_INSTRUMENT_NAME_LENGTH
    ) {
      pushProjectInstrumentIssue(
        issues,
        `${descriptorPath}.kind`,
        "Descriptor kind must be non-empty and bounded.",
      );
    }

    if (typeof descriptor.enabled !== "boolean") {
      pushProjectInstrumentIssue(
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
    pushProjectInstrumentIssue(
      issues,
      path,
      `A descriptor cannot contain more than ${MAXIMUM_DESCRIPTOR_PARAMETER_COUNT} parameters.`,
    );
  }

  for (const [key, value] of entries) {
    if (
      key.length === 0
      || key.length > MAXIMUM_INSTRUMENT_NAME_LENGTH
    ) {
      pushProjectInstrumentIssue(
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
      pushProjectInstrumentIssue(
        issues,
        `${path}.${key}`,
        "Parameters must be strings, finite numbers, or booleans.",
      );
    } else if (typeof value === "number" && !Number.isFinite(value)) {
      pushProjectInstrumentIssue(
        issues,
        `${path}.${key}`,
        "Numeric parameters must be finite.",
      );
    }
  }
}

function validateProjectInstrumentInterpretation(
  instrument: ProjectInstrument,
  issues: ValidationIssue[],
): void {
  const interpretation = instrument.interpretation;

  if (!Number.isSafeInteger(interpretation.transposeSemitones)) {
    pushProjectInstrumentIssue(
      issues,
      "interpretation.transposeSemitones",
      "ProjectInstrument transposition must be a safe integer.",
    );
  }

  if (!Number.isSafeInteger(interpretation.timingOffsetTicks)) {
    pushProjectInstrumentIssue(
      issues,
      "interpretation.timingOffsetTicks",
      "ProjectInstrument timing offset must be a safe integer.",
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
    pushProjectInstrumentIssue(
      issues,
      "interpretation.probability",
      "ProjectInstrument probability must be between 0 and 1.",
    );
  }
}

function validateFiniteNumber(
  value: number,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Number.isFinite(value)) {
    pushProjectInstrumentIssue(issues, path, "Value must be finite.");
  }
}

function validatePositiveNumber(
  value: number,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Number.isFinite(value) || value <= 0) {
    pushProjectInstrumentIssue(issues, path, "Value must be positive and finite.");
  }
}

function validateNonNegativeNumber(
  value: number,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Number.isFinite(value) || value < 0) {
    pushProjectInstrumentIssue(
      issues,
      path,
      "Value must be non-negative and finite.",
    );
  }
}

function validateNumberInRange(
  value: number,
  path: string,
  minimum: number,
  maximum: number,
  issues: ValidationIssue[],
): void {
  if (
    !Number.isFinite(value)
    || value < minimum
    || value > maximum
  ) {
    pushProjectInstrumentIssue(
      issues,
      path,
      `Value must be a finite number between ${minimum} and ${maximum}.`,
    );
  }
}
