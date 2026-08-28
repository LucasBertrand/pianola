import type {
  AdsrEnvelope,
  InstrumentConfig,
  ProjectInstrument,
} from "../instruments/instrument";
import {
  MAXIMUM_DESCRIPTOR_PARAMETER_COUNT,
  MAXIMUM_INSTRUMENT_DESCRIPTOR_COUNT,
  MAXIMUM_INSTRUMENT_NAME_LENGTH,
  MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
  MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
} from "../instruments/instrument";
import {
  MAXIMUM_ENTITY_ID_LENGTH,
} from "../identifiers";
import {
  INSTRUMENT_CONSTANTS,
} from "../instruments/instrument-constants";
import type {
  ValidationIssue,
} from "./validation-result";

function validateBoundedIdentifier(
  value: string,
  path: string,
  label: string,
  issues: ValidationIssue[],
): void {
  if (value.trim().length === 0 || value.length > MAXIMUM_ENTITY_ID_LENGTH) {
    issues.push({
      code: value.trim().length === 0 ? "EMPTY_ID" : "INVALID_ID",
      path,
      message: `${label} must contain between 1 and ${MAXIMUM_ENTITY_ID_LENGTH} characters.`,
    });
  }
}

function pushProjectInstrumentIssue(
  issues: ValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({ code: "INVALID_INSTRUMENT", path, message });
}
export function appendInstrumentConfigIssues(
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
  if (typeof instrument.oscillatorFreePhase !== "boolean") {
    pushProjectInstrumentIssue(
      issues,
      "instrument.oscillatorFreePhase",
      "Oscillator free phase must be a boolean.",
    );
  }
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
    instrument.filterKeyTracking,
    "instrument.filterKeyTracking",
    INSTRUMENT_CONSTANTS.minimumFilterKeyTracking,
    INSTRUMENT_CONSTANTS.maximumFilterKeyTracking,
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
  validateNumberInRange(
    envelope.curve,
    `${path}.curve`,
    INSTRUMENT_CONSTANTS.minimumEnvelopeCurve,
    INSTRUMENT_CONSTANTS.maximumEnvelopeCurve,
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

export function appendInstrumentDescriptorIssues(
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

export function appendProjectInstrumentInterpretationIssues(
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
