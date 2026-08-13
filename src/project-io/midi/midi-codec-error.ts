export type MidiCodecErrorCode =
  | "INVALID_ARGUMENT"
  | "FILE_TOO_LARGE"
  | "TRUNCATED_FILE"
  | "INVALID_HEADER"
  | "INVALID_TRACK"
  | "INVALID_EVENT"
  | "INVALID_RUNNING_STATUS"
  | "INVALID_VLQ"
  | "LIMIT_EXCEEDED"
  | "UNSUPPORTED_FORMAT"
  | "UNSUPPORTED_TIME_DIVISION";

/**
 * Structured codec failure suitable for conversion into an application dialog.
 */
export class MidiCodecError extends Error {
  public readonly code: MidiCodecErrorCode;
  public readonly byteOffset: number | null;
  public readonly trackIndex: number | null;

  public constructor(
    code: MidiCodecErrorCode,
    message: string,
    byteOffset: number | null = null,
    trackIndex: number | null = null,
  ) {
    super(message);
    this.name = "MidiCodecError";
    this.code = code;
    this.byteOffset = byteOffset;
    this.trackIndex = trackIndex;
  }
}
