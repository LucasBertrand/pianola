import {
  MAXIMUM_ENTITY_ID_LENGTH,
} from "../../identifiers";
import type {
  ValidationIssue,
  ValidationResult,
} from "../../validation/validation-result";
import {
  MAXIMUM_INSTRUMENT_NAME_LENGTH,
} from "../project-instrument";
import {
  validateSynthConfig,
} from "../synth/synth-validation";
import type {
  InstrumentPreset,
} from "./instrument-preset";

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
  const configValidation = validateSynthConfig(preset.config);
  for (const issue of configValidation.issues) {
    issues.push({
      ...issue,
      code: "INVALID_PRESET",
      path: `config.${issue.path}`,
    });
  }
  return { valid: issues.length === 0, issues };
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
