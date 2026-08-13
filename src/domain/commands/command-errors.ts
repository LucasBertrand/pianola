import type { PianoRollCommand } from "./command-types";

export type CommandErrorCode =
  | "INVALID_TRANSACTION"
  | "INVALID_COMMAND"
  | "INSTRUMENT_NOT_FOUND"
  | "INSTRUMENT_ALREADY_EXISTS"
  | "INSTRUMENT_LOCKED"
  | "TRACK_NOT_FOUND"
  | "TRACK_ALREADY_EXISTS"
  | "NOTE_NOT_FOUND"
  | "NOTE_ALREADY_EXISTS"
  | "NOTE_OVERLAP"
  | "DUPLICATE_NOTE_ID"
  | "INVALID_INSTRUMENT_ORDER";

export class CommandRejectedError extends Error {
  public readonly code: CommandErrorCode;
  public readonly commandType: PianoRollCommand["type"] | null;

  public constructor(
    code: CommandErrorCode,
    message: string,
    commandType: PianoRollCommand["type"] | null,
  ) {
    super(message);
    this.name = "CommandRejectedError";
    this.code = code;
    this.commandType = commandType;
  }
}

