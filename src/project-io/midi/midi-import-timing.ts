import { MIDI_CONSTANTS } from "../../config/midi-config";
import { PROJECT_CONSTANTS } from "../../config/domain-limits";
import {
  type InstrumentId,
} from "../../domain/identifiers";
import {
  type Note,
} from "../../domain/notes/note";
import {
  type TimeSignature,
} from "../../domain/transport/transport";
import { MidiImportError } from "./midi-import-error";
import type {
  ImportedSourceNote,
  TempoCandidate,
  TimeSignatureCandidate,
} from "./midi-import-types";

export function convertSourceNotes(
  sourceNotes: readonly ImportedSourceNote[],
  instrumentId: InstrumentId,
  sourcePpqn: number,
  instrumentIndex: number,
): readonly Note[] {
  const sortedNotes = [...sourceNotes].sort((left, right) =>
    left.startTick - right.startTick
    || left.sourceOrder - right.sourceOrder);
  const notes: Note[] = [];

  for (
    let noteIndex = 0;
    noteIndex < sortedNotes.length;
    noteIndex += 1
  ) {
    const sourceNote = sortedNotes[noteIndex];

    if (sourceNote === undefined) {
      continue;
    }

    let startTick = convertTick(
      sourceNote.startTick,
      sourcePpqn,
    );
    let endTick = convertTick(
      sourceNote.endTick,
      sourcePpqn,
    );
    const minimumDuration =
      MIDI_CONSTANTS.minimumImportedDurationTicks;

    if (endTick - startTick < minimumDuration) {
      const shiftedStartTick = endTick - minimumDuration;

      if (shiftedStartTick >= 0) {
        startTick = shiftedStartTick;
      } else {
        endTick = startTick + minimumDuration;
      }
    }

    notes.push({
      id:
        `midi-note-${String(instrumentIndex)}-${String(noteIndex).padStart(8, "0")}`,
      pitch: sourceNote.pitch,
      startTick,
      durationTicks: endTick - startTick,
      velocity: sourceNote.velocity,
      instrumentId,
      enabled: true,
    });
  }

  return notes;
}

export function convertTick(tick: number, sourcePpqn: number): number {
  const wholeQuarters = Math.floor(tick / sourcePpqn);
  const remainder = tick % sourcePpqn;
  const converted =
    wholeQuarters * PROJECT_CONSTANTS.ppqn
    + Math.round(
      remainder * PROJECT_CONSTANTS.ppqn / sourcePpqn,
    );

  if (!Number.isSafeInteger(converted) || converted < 0) {
    throw new MidiImportError(
      "A MIDI tick cannot be represented safely in the project timeline.",
    );
  }

  return converted;
}

export function selectTempo(candidates: TempoCandidate[]): number {
  candidates.sort(compareMetaCandidates);
  const selected = candidates[0]?.event;

  if (selected === undefined) {
    return PROJECT_CONSTANTS.defaultTempoBpm;
  }

  return Number(
    (
      60_000_000 / selected.microsecondsPerQuarterNote
    ).toFixed(6),
  );
}

export function normalizeImportedTempo(tempoBpm: number): number {
  const steppedTempo =
    Math.round(
      tempoBpm / PROJECT_CONSTANTS.tempoStepBpm,
    ) * PROJECT_CONSTANTS.tempoStepBpm;

  return Number(
    Math.min(
      PROJECT_CONSTANTS.maximumTempoBpm,
      Math.max(
        PROJECT_CONSTANTS.minimumTempoBpm,
        steppedTempo,
      ),
    ).toFixed(6),
  );
}

export function formatTempoForWarning(tempoBpm: number): string {
  return tempoBpm
    .toFixed(6)
    .replace(/0+$/u, "")
    .replace(/\.$/u, "");
}

export function selectTimeSignature(
  candidates: TimeSignatureCandidate[],
): {
  readonly timeSignature: TimeSignature;
  readonly acceptedEventCount: number;
  readonly invalidEventCount: number;
} {
  candidates.sort(compareMetaCandidates);
  let invalidEventCount = 0;
  let selectedTimeSignature: TimeSignature | null = null;

  for (const candidate of candidates) {
    const event = candidate.event;

    if (
      Number.isSafeInteger(event.numerator)
      && event.numerator > 0
      && isSupportedTimeSignatureDenominator(
        event.denominator,
      )
    ) {
      if (selectedTimeSignature === null) {
        selectedTimeSignature = {
          numerator: event.numerator,
          denominator: event.denominator,
        };
      }
    } else {
      invalidEventCount += 1;
    }
  }

  if (selectedTimeSignature !== null) {
    return {
      timeSignature: selectedTimeSignature,
      acceptedEventCount: 1,
      invalidEventCount,
    };
  }

  return {
    timeSignature: {
      numerator:
        PROJECT_CONSTANTS.defaultTimeSignatureNumerator,
      denominator:
        PROJECT_CONSTANTS.defaultTimeSignatureDenominator,
    },
    acceptedEventCount: 0,
    invalidEventCount,
  };
}

function compareMetaCandidates(
  left: TempoCandidate | TimeSignatureCandidate,
  right: TempoCandidate | TimeSignatureCandidate,
): number {
  return (
    left.event.absoluteTick - right.event.absoluteTick
    || left.trackIndex - right.trackIndex
    || left.eventIndex - right.eventIndex
  );
}

export function isSupportedTimeSignatureDenominator(
  denominator: number,
): denominator is TimeSignature["denominator"] {
  return (
    denominator === 1
    || denominator === 2
    || denominator === 4
    || denominator === 8
    || denominator === 16
    || denominator === 32
  );
}

