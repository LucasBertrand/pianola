import {
  MAXIMUM_ENTITY_ID_LENGTH,
} from "../identifiers";
import {
  MAXIMUM_MASTER_GAIN,
  MINIMUM_MASTER_GAIN,
} from "../master-bus";
import {
  assertValidationResult,
  type ValidationIssue,
  type ValidationResult,
} from "../validation/validation-result";
import {
  appendInstrumentDescriptorIssues,
} from "./instrument-descriptors-validation";
import type {
  ProjectInstrument,
} from "./project-instrument";
import {
  MAXIMUM_INSTRUMENT_NAME_LENGTH,
} from "./project-instrument";
import type {
  SynthConfig,
} from "./synth/synth-config";
import {
  validateSynthConfig,
} from "./synth/synth-validation";

export function validateProjectInstrument(
  instrument: ProjectInstrument,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  validateBoundedIdentifier(instrument.id, "id", "ProjectInstrument ID", issues);
  validateBoundedIdentifier(
    instrument.instrument.kind,
    "instrument.kind",
    "Instrument kind",
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
    issues.push({ ...issue, path: `instrument.${issue.path}` });
  }
  if (!Number.isFinite(instrument.pan) || instrument.pan < -1 || instrument.pan > 1) {
    pushProjectInstrumentIssue(
      issues,
      "pan",
      "ProjectInstrument pan must be a finite number between -1 and 1.",
    );
  }
  appendInstrumentDescriptorIssues(instrument.effects, "effects", issues);
  appendInstrumentDescriptorIssues(instrument.generativeRules, "generativeRules", issues);
  appendProjectInstrumentInterpretationIssues(instrument, issues);
  return { valid: issues.length === 0, issues };
}

export function validateInstrumentConfig(
  instrument: SynthConfig,
): ValidationResult {
  return validateSynthConfig(instrument);
}

export function assertValidProjectInstrument(
  instrument: ProjectInstrument,
): void {
  assertValidationResult(validateProjectInstrument(instrument));
}

function appendProjectInstrumentInterpretationIssues(
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
  validatePositiveNumber(interpretation.gateRatio, "interpretation.gateRatio", issues);
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
  issues.push({ code: "INVALID_INSTRUMENT", path, message });
}
