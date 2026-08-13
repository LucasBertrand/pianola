export type NativeProjectFileErrorCode =
  | "INVALID_JSON"
  | "INVALID_FORMAT"
  | "UNSUPPORTED_VERSION"
  | "INVALID_DATA";

export class NativeProjectFileError extends Error {
  public readonly code: NativeProjectFileErrorCode;
  public readonly path: string;

  public constructor(
    code: NativeProjectFileErrorCode,
    path: string,
    message: string,
  ) {
    super(message);
    this.name = "NativeProjectFileError";
    this.code = code;
    this.path = path;
  }
}

export function fail(
  code: NativeProjectFileErrorCode,
  path: string,
  message: string,
): never {
  throw new NativeProjectFileError(code, path, message);
}

