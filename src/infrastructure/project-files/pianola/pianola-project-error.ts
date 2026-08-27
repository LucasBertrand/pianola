import {
  ProjectPersistenceError,
} from "../../../persistence/project-persistence-model";

export type PianolaProjectFileErrorCode =
  | "INVALID_JSON"
  | "INVALID_FORMAT"
  | "UNSUPPORTED_VERSION"
  | "INVALID_DATA";

export function fail(
  code: PianolaProjectFileErrorCode,
  path: string,
  message: string,
): never {
  throw new ProjectPersistenceError(
    code === "UNSUPPORTED_VERSION" ? "FUTURE_VERSION" : "INVALID_DATA",
    `[${path}] ${message}`,
  );
}
