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
  | "INVALID_TEMPO"
  | "INVALID_SCALE"
  | "INVALID_PPQN"
  | "INVALID_TIME_SIGNATURE"
  | "INVALID_LOOP"
  | "INVALID_TRANSPORT_AUTOMATION"
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

export function assertValidationResult(result: ValidationResult): void {
  if (!result.valid) {
    throw new DomainValidationError(result.issues);
  }
}
