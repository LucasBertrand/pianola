import {
  ProjectPersistenceError,
} from "./project-persistence-error";

export function readPersistenceRecord(
  source: unknown,
  path: string,
): Record<string, unknown> {
  if (
    source === null
    || typeof source !== "object"
    || Array.isArray(source)
  ) {
    return fail(path, "Expected an object.");
  }

  return source as Record<string, unknown>;
}

export function readPersistenceString(
  source: unknown,
  path: string,
  maximumLength: number,
): string {
  if (
    typeof source !== "string"
    || source.length === 0
    || source.length > maximumLength
  ) {
    return fail(path, "Expected a bounded non-empty string.");
  }

  return source;
}

export function readPersistenceIsoDate(
  source: unknown,
  path: string,
): string {
  const value = readPersistenceString(source, path, 64);

  if (!Number.isFinite(Date.parse(value))) {
    return fail(path, "Expected an ISO date.");
  }

  return value;
}

export function readPersistenceInteger(
  source: unknown,
  path: string,
  minimum = 0,
): number {
  if (
    typeof source !== "number"
    || !Number.isSafeInteger(source)
    || source < minimum
  ) {
    return fail(path, "Expected a safe integer.");
  }

  return source;
}

export function readPersistenceNumber(
  source: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof source !== "number"
    || !Number.isFinite(source)
    || source < minimum
    || source > maximum
  ) {
    return fail(path, "Expected a finite number in range.");
  }

  return source;
}

export function readPersistenceBoolean(
  source: unknown,
  path: string,
): boolean {
  if (typeof source !== "boolean") {
    return fail(path, "Expected a boolean.");
  }

  return source;
}

export function parsePersistenceJson(serialized: string): unknown {
  try {
    return JSON.parse(serialized) as unknown;
  } catch (error: unknown) {
    throw new ProjectPersistenceError(
      "CORRUPT_DATA",
      "Stored data does not contain valid JSON.",
      { cause: error },
    );
  }
}

function fail(path: string, message: string): never {
  throw new ProjectPersistenceError(
    "INVALID_DATA",
    `${message} Location: ${path}.`,
  );
}
