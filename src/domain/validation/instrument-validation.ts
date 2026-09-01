import {
  type InstrumentConfig,
  type InstrumentPreset,
  type ProjectInstrument,
} from "../instruments/instrument";
import {
  MAXIMUM_INSTRUMENT_NAME_LENGTH,
} from "../instruments/instrument";
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
} from "./validation-result";
import {
  appendInstrumentConfigIssues,
  appendInstrumentDescriptorIssues,
  appendProjectInstrumentInterpretationIssues,
} from "./project-instrument-value-validation";

export function validateProjectInstrument(instrument: ProjectInstrument): ValidationResult {
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

  appendInstrumentDescriptorIssues(instrument.effects, "effects", issues);
  appendInstrumentDescriptorIssues(
    instrument.generativeRules,
    "generativeRules",
    issues,
  );
  appendProjectInstrumentInterpretationIssues(instrument, issues);

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateInstrumentConfig(
  instrument: InstrumentConfig,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  appendInstrumentConfigIssues(instrument, issues);

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

export function assertValidProjectInstrument(
  instrument: ProjectInstrument,
): void {
  assertValidationResult(validateProjectInstrument(instrument));
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
