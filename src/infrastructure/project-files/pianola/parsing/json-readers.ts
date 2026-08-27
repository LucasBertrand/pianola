import { fail } from "../pianola-project-error";

export type JsonPrimitive = string | number | boolean;
export type UnknownRecord = Readonly<Record<string, unknown>>;

export function assertExactRecordKeys(
  record: UnknownRecord,
  expectedKeys: readonly string[],
  path: string,
): void {
  const actualKeys = Object.keys(record);
  const expectedKeySet = new Set(expectedKeys);

  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key) => !expectedKeySet.has(key))
  ) {
    fail(
      "INVALID_DATA",
      path,
      "Record keys must exactly match the instrument order.",
    );
  }
}

export function readRecord(
  source: unknown,
  path: string,
): UnknownRecord {
  if (
    typeof source !== "object"
    || source === null
    || Array.isArray(source)
  ) {
    return fail(
      "INVALID_DATA",
      path,
      "Expected an object.",
    );
  }

  return source as UnknownRecord;
}

export function readArray(
  source: unknown,
  path: string,
): readonly unknown[] {
  if (!Array.isArray(source)) {
    return fail(
      "INVALID_DATA",
      path,
      "Expected an array.",
    );
  }

  return source;
}

export function readBoundedArray(
  source: unknown,
  path: string,
  maximumLength: number,
): readonly unknown[] {
  const values = readArray(source, path);

  if (values.length > maximumLength) {
    fail(
      "INVALID_DATA",
      path,
      `Array cannot contain more than ${maximumLength} values.`,
    );
  }

  return values;
}

export function readString(
  source: unknown,
  path: string,
  maximumLength: number,
): string {
  if (
    typeof source !== "string"
    || source.length > maximumLength
  ) {
    return fail(
      "INVALID_DATA",
      path,
      `Expected a string no longer than ${maximumLength} characters.`,
    );
  }

  return source;
}

export function readNonEmptyString(
  source: unknown,
  path: string,
  maximumLength: number,
): string {
  const value = readString(source, path, maximumLength);

  if (value.trim().length === 0) {
    fail(
      "INVALID_DATA",
      path,
      "Expected a non-empty string.",
    );
  }

  return value;
}

export function readIsoDate(
  source: unknown,
  path: string,
): string {
  const value = readString(source, path, 64);
  const timestamp = Date.parse(value);

  if (
    !Number.isFinite(timestamp)
    || new Date(timestamp).toISOString() !== value
  ) {
    fail(
      "INVALID_DATA",
      path,
      "Expected a valid ISO date string.",
    );
  }

  return value;
}

export function readBoolean(
  source: unknown,
  path: string,
): boolean {
  if (typeof source !== "boolean") {
    return fail(
      "INVALID_DATA",
      path,
      "Expected a boolean.",
    );
  }

  return source;
}

export function readFiniteNumber(
  source: unknown,
  path: string,
): number {
  if (typeof source !== "number" || !Number.isFinite(source)) {
    return fail(
      "INVALID_DATA",
      path,
      "Expected a finite number.",
    );
  }

  return source;
}

export function readNonNegativeNumber(
  source: unknown,
  path: string,
): number {
  const value = readFiniteNumber(source, path);

  if (value < 0) {
    fail(
      "INVALID_DATA",
      path,
      "Expected a non-negative number.",
    );
  }

  return value;
}

export function readPositiveNumber(
  source: unknown,
  path: string,
): number {
  const value = readFiniteNumber(source, path);

  if (value <= 0) {
    fail(
      "INVALID_DATA",
      path,
      "Expected a positive number.",
    );
  }

  return value;
}

export function readNumberInRange(
  source: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  const value = readFiniteNumber(source, path);

  if (value < minimum || value > maximum) {
    fail(
      "INVALID_DATA",
      path,
      `Expected a number between ${minimum} and ${maximum}.`,
    );
  }

  return value;
}

export function readSafeInteger(
  source: unknown,
  path: string,
): number {
  if (
    typeof source !== "number"
    || !Number.isSafeInteger(source)
  ) {
    return fail(
      "INVALID_DATA",
      path,
      "Expected a safe integer.",
    );
  }

  return source;
}

export function readNonNegativeSafeInteger(
  source: unknown,
  path: string,
): number {
  return readIntegerInRange(
    source,
    path,
    0,
    Number.MAX_SAFE_INTEGER,
  );
}

export function readPositiveSafeInteger(
  source: unknown,
  path: string,
): number {
  return readIntegerInRange(
    source,
    path,
    1,
    Number.MAX_SAFE_INTEGER,
  );
}

export function readIntegerInRange(
  source: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  const value = readSafeInteger(source, path);

  if (value < minimum || value > maximum) {
    fail(
      "INVALID_DATA",
      path,
      `Expected an integer between ${minimum} and ${maximum}.`,
    );
  }

  return value;
}
