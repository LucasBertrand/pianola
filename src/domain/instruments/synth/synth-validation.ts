import type {
  ValidationIssue,
  ValidationResult,
} from "../../validation/validation-result";
import type {
  SynthConfig,
} from "./synth-config";
import type {
  AdsrEnvelope,
} from "./synth-envelope";
import {
  MAXIMUM_SYNTH_POLYPHONY,
  MINIMUM_SYNTH_POLYPHONY,
  SYNTH_CONSTANTS,
} from "./synth-constants";

export function validateSynthConfig(instrument: SynthConfig): ValidationResult {
  const issues: ValidationIssue[] = [];

  appendSynthConfigIssues(instrument, issues);
  return { valid: issues.length === 0, issues };
}

export function appendSynthConfigIssues(
  instrument: SynthConfig,
  issues: ValidationIssue[],
): void {
  validateWaveform(instrument.oscillatorWaveform, "instrument.oscillatorWaveform", issues);
  if (
    !Number.isSafeInteger(instrument.polyphony)
    || instrument.polyphony < MINIMUM_SYNTH_POLYPHONY
    || instrument.polyphony > MAXIMUM_SYNTH_POLYPHONY
  ) {
    pushSynthIssue(
      issues,
      "instrument.polyphony",
      `Synth polyphony must be an integer between ${MINIMUM_SYNTH_POLYPHONY} and ${MAXIMUM_SYNTH_POLYPHONY}.`,
    );
  }
  validateFiniteNumber(
    instrument.oscillatorDetuneCents,
    "instrument.oscillatorDetuneCents",
    issues,
  );
  if (typeof instrument.oscillatorFreePhase !== "boolean") {
    pushSynthIssue(
      issues,
      "instrument.oscillatorFreePhase",
      "Oscillator free phase must be a boolean.",
    );
  }
  validateNumberInRange(
    instrument.pulseWidth,
    "instrument.pulseWidth",
    SYNTH_CONSTANTS.minimumPulseWidth,
    SYNTH_CONSTANTS.maximumPulseWidth,
    issues,
  );
  validateEnvelope(instrument.envelope, "instrument.envelope", issues);
  validateNumberInRange(
    instrument.filterCutoffHz,
    "instrument.filterCutoffHz",
    SYNTH_CONSTANTS.minimumFilterCutoffHz,
    SYNTH_CONSTANTS.maximumFilterCutoffHz,
    issues,
  );
  validateNumberInRange(
    instrument.filterResonance,
    "instrument.filterResonance",
    SYNTH_CONSTANTS.minimumFilterResonance,
    SYNTH_CONSTANTS.maximumFilterResonance,
    issues,
  );
  validateNumberInRange(
    instrument.filterKeyTracking,
    "instrument.filterKeyTracking",
    SYNTH_CONSTANTS.minimumFilterKeyTracking,
    SYNTH_CONSTANTS.maximumFilterKeyTracking,
    issues,
  );
  validateNumberInRange(
    instrument.filterEnvelopeAmountOctaves,
    "instrument.filterEnvelopeAmountOctaves",
    SYNTH_CONSTANTS.minimumFilterEnvelopeAmountOctaves,
    SYNTH_CONSTANTS.maximumFilterEnvelopeAmountOctaves,
    issues,
  );
  validateEnvelope(instrument.filterEnvelope, "instrument.filterEnvelope", issues);
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
    SYNTH_CONSTANTS.maximumEnvelopeTimeSeconds,
    issues,
  );
  validateNumberInRange(
    envelope.decaySeconds,
    `${path}.decaySeconds`,
    0,
    SYNTH_CONSTANTS.maximumEnvelopeDecaySeconds,
    issues,
  );
  if (
    !Number.isFinite(envelope.sustainLevel)
    || envelope.sustainLevel < 0
    || envelope.sustainLevel > 1
  ) {
    pushSynthIssue(
      issues,
      `${path}.sustainLevel`,
      "Envelope sustain level must be between 0 and 1.",
    );
  }
  validateNumberInRange(
    envelope.releaseSeconds,
    `${path}.releaseSeconds`,
    0,
    SYNTH_CONSTANTS.maximumEnvelopeTimeSeconds,
    issues,
  );
  validateNumberInRange(
    envelope.curve,
    `${path}.curve`,
    SYNTH_CONSTANTS.minimumEnvelopeCurve,
    SYNTH_CONSTANTS.maximumEnvelopeCurve,
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
    pushSynthIssue(issues, path, "Oscillator waveform is not supported.");
  }
}

function validateFiniteNumber(
  value: number,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Number.isFinite(value)) {
    pushSynthIssue(issues, path, "Value must be finite.");
  }
}

function validateNumberInRange(
  value: number,
  path: string,
  minimum: number,
  maximum: number,
  issues: ValidationIssue[],
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    pushSynthIssue(
      issues,
      path,
      `Value must be a finite number between ${minimum} and ${maximum}.`,
    );
  }
}

function pushSynthIssue(
  issues: ValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({ code: "INVALID_INSTRUMENT", path, message });
}
