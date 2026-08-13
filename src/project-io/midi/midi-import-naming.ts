import { PROJECT_CONSTANTS } from "../../config/domain-limits";
import type { InstrumentId } from "../../domain/model";
import type { MutableInstrumentGroup } from "./midi-import-types";

export function createImportedInstrumentName(
  format: 0 | 1,
  group: MutableInstrumentGroup,
  channelCount: number,
): string {
  if (format === 0) {
    return `Channel ${String(group.channel + 1)}`;
  }

  const baseName =
    group.trackName.length > 0
      ? group.trackName
      : `Track ${String(group.trackIndex + 1)}`;

  return sanitizeInstrumentName(
    channelCount > 1
      ? `${baseName} · Ch ${String(group.channel + 1)}`
      : baseName,
  );
}

export function createImportedInstrumentId(
  trackIndex: number,
  channel: number,
): InstrumentId {
  return `midi-instrument-${String(trackIndex)}-${String(channel)}`;
}

export function createImportedProjectTitle(
  sourceFileName: string,
  fallbackTrackName: string | undefined,
): string {
  const baseName = sourceFileName
    .replace(/^.*[\\/]/u, "")
    .replace(/\.midi?$/iu, "")
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .trim();
  const title =
    baseName.length > 0
      ? baseName
      : fallbackTrackName?.trim() || "Imported MIDI";

  return title.slice(
    0,
    PROJECT_CONSTANTS.maximumProjectTitleLength,
  );
}

export function sanitizeInstrumentName(name: string): string {
  const sanitized = name
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .trim();

  return (
    sanitized.length > 0
      ? sanitized
      : "MIDI Instrument"
  ).slice(0, PROJECT_CONSTANTS.maximumInstrumentNameLength);
}
