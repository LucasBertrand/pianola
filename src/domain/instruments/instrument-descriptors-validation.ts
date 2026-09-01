import {
  MAXIMUM_ENTITY_ID_LENGTH,
} from "../identifiers";
import type {
  ValidationIssue,
} from "../validation/validation-result";
import type {
  ProjectInstrument,
} from "./project-instrument";
import {
  MAXIMUM_DESCRIPTOR_PARAMETER_COUNT,
  MAXIMUM_INSTRUMENT_DESCRIPTOR_COUNT,
  MAXIMUM_INSTRUMENT_NAME_LENGTH,
} from "./project-instrument";

export function appendInstrumentDescriptorIssues(
  descriptors: ProjectInstrument["effects"] | ProjectInstrument["generativeRules"],
  path: string,
  issues: ValidationIssue[],
): void {
  if (descriptors.length > MAXIMUM_INSTRUMENT_DESCRIPTOR_COUNT) {
    pushDescriptorIssue(
      issues,
      path,
      `An instrument cannot contain more than ${MAXIMUM_INSTRUMENT_DESCRIPTOR_COUNT} descriptors of one type.`,
    );
  }

  const ids = new Set<string>();
  for (let descriptorIndex = 0; descriptorIndex < descriptors.length; descriptorIndex += 1) {
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
      pushDescriptorIssue(
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
      pushDescriptorIssue(
        issues,
        `${descriptorPath}.kind`,
        "Descriptor kind must be non-empty and bounded.",
      );
    }
    if (typeof descriptor.enabled !== "boolean") {
      pushDescriptorIssue(
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
    pushDescriptorIssue(
      issues,
      path,
      `A descriptor cannot contain more than ${MAXIMUM_DESCRIPTOR_PARAMETER_COUNT} parameters.`,
    );
  }
  for (const [key, value] of entries) {
    if (key.length === 0 || key.length > MAXIMUM_INSTRUMENT_NAME_LENGTH) {
      pushDescriptorIssue(
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
      pushDescriptorIssue(
        issues,
        `${path}.${key}`,
        "Parameters must be strings, finite numbers, or booleans.",
      );
    } else if (typeof value === "number" && !Number.isFinite(value)) {
      pushDescriptorIssue(
        issues,
        `${path}.${key}`,
        "Numeric parameters must be finite.",
      );
    }
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
      message: `${label} must contain between 1 and ${MAXIMUM_ENTITY_ID_LENGTH} characters.`,
    });
  }
}

function pushDescriptorIssue(
  issues: ValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({ code: "INVALID_INSTRUMENT", path, message });
}
