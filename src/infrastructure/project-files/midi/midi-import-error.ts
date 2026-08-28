import { MidiCodecError } from "./midi-codec-error";

export class MidiImportError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MidiImportError";
  }
}

export function formatMidiImportError(error: unknown): string {
  if (error instanceof MidiImportError) {
    return error.message;
  }

  if (error instanceof MidiCodecError) {
    const location =
      error.trackIndex !== null
        ? ` Track ${String(error.trackIndex + 1)}.`
        : "";
    return `${error.message}${location}`;
  }

  return error instanceof Error
    ? error.message
    : "The MIDI file could not be imported.";
}

