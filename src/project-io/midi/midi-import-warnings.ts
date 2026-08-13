import type { ParsedMidiFile } from "./standard-midi-file";

export function countTracksWithoutEndOfTrack(
  file: ParsedMidiFile,
): number {
  let count = 0;

  for (const track of file.summary.tracks) {
    if (!track.endedByEndOfTrackEvent) {
      count += 1;
    }
  }

  return count;
}

export function createImportWarnings(options: {
  readonly tempoChangeCount: number;
  readonly timeSignatureChangeCount: number;
  readonly invalidTimeSignatureCount: number;
  readonly orphanNoteOffCount: number;
  readonly danglingNoteOnCount: number;
  readonly ignoredControlChangeCount: number;
  readonly ignoredSustainControlChangeCount: number;
  readonly ignoredExpressiveEventCount: number;
  readonly skippedSystemExclusiveEventCount: number;
  readonly skippedUnknownMetaEventCount: number;
  readonly missingEndOfTrackEventCount: number;
}): readonly string[] {
  const warnings: string[] = [];

  appendCountWarning(
    warnings,
    options.tempoChangeCount,
    "later tempo event was ignored",
    "later tempo events were ignored",
  );
  appendCountWarning(
    warnings,
    options.timeSignatureChangeCount,
    "later time-signature event was ignored",
    "later time-signature events were ignored",
  );
  appendCountWarning(
    warnings,
    options.invalidTimeSignatureCount,
    "unsupported time signature was ignored",
    "unsupported time signatures were ignored",
  );
  appendCountWarning(
    warnings,
    options.ignoredControlChangeCount,
    "Control Change event was ignored",
    "Control Change events were ignored",
  );
  appendCountWarning(
    warnings,
    options.ignoredSustainControlChangeCount,
    "CC64 sustain event was ignored",
    "CC64 sustain events were ignored",
  );
  appendCountWarning(
    warnings,
    options.ignoredExpressiveEventCount,
    "unsupported channel-expression event was ignored",
    "unsupported channel-expression events were ignored",
  );
  appendCountWarning(
    warnings,
    options.orphanNoteOffCount,
    "orphan Note Off was ignored",
    "orphan Note Off events were ignored",
  );
  appendCountWarning(
    warnings,
    options.danglingNoteOnCount,
    "dangling Note On was closed at the track end",
    "dangling Note On events were closed at the track end",
  );
  appendCountWarning(
    warnings,
    options.skippedSystemExclusiveEventCount,
    "SysEx event was skipped",
    "SysEx events were skipped",
  );
  appendCountWarning(
    warnings,
    options.skippedUnknownMetaEventCount,
    "unknown metadata event was skipped",
    "unknown metadata events were skipped",
  );
  appendCountWarning(
    warnings,
    options.missingEndOfTrackEventCount,
    "track had no End of Track event",
    "tracks had no End of Track event",
  );

  return warnings;
}

function appendCountWarning(
  warnings: string[],
  count: number,
  singular: string,
  plural: string,
): void {
  if (count > 0) {
    warnings.push(
      `${String(count)} ${count === 1 ? singular : plural}.`,
    );
  }
}

