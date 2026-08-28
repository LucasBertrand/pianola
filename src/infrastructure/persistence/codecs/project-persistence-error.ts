export type ProjectPersistenceErrorCode =
  | "CONFLICT"
  | "CORRUPT_DATA"
  | "FUTURE_VERSION"
  | "INVALID_DATA"
  | "QUOTA_EXCEEDED"
  | "STORAGE_UNAVAILABLE";

export class ProjectPersistenceError extends Error {
  public constructor(
    public readonly code: ProjectPersistenceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProjectPersistenceError";
  }
}
