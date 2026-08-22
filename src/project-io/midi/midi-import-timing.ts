import { MIDI_CONSTANTS } from "../../config/midi-config";
import { PROJECT_CONSTANTS } from "../../config/domain-limits";
import {
  type InstrumentId,
} from "../../domain/identifiers";
import {
  type Note,
} from "../../domain/notes/note";
import {
  createDefaultTimeSignature,
  getTicksPerMeasure,
  type MeterMarker,
  type TempoMarker,
  type TimeSignature,
} from "../../domain/transport/time-map";
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

export interface TempoMarkerSelection {
  readonly markers: readonly TempoMarker[];
  readonly ignoredEventCount: number;
  readonly adjustedEventCount: number;
}

/**
 * Imports every tempo change. Events sharing a converted tick are ignored
 * (the first one wins) and a default marker is inserted at tick 0 when the
 * first event occurs later, matching the MIDI default of 120 BPM.
 */
export function selectTempoMarkers(
  candidates: TempoCandidate[],
  sourcePpqn: number,
): TempoMarkerSelection {
  candidates.sort(compareMetaCandidates);
  const markers: TempoMarker[] = [];
  const seenTicks = new Set<number>();
  let ignoredEventCount = 0;
  let adjustedEventCount = 0;

  for (const candidate of candidates) {
    const sourceBpm = Number(
      (
        60_000_000 / candidate.event.microsecondsPerQuarterNote
      ).toFixed(6),
    );
    const bpm = normalizeImportedTempo(sourceBpm);

    if (bpm !== sourceBpm) {
      adjustedEventCount += 1;
    }

    const startTick = convertTick(
      candidate.event.absoluteTick,
      sourcePpqn,
    );

    if (seenTicks.has(startTick)) {
      ignoredEventCount += 1;
      continue;
    }

    seenTicks.add(startTick);
    markers.push({ startTick, bpm });
  }

  if (markers[0]?.startTick !== 0) {
    markers.unshift({
      startTick: 0,
      bpm: PROJECT_CONSTANTS.defaultTempoBpm,
    });
  }

  return { markers, ignoredEventCount, adjustedEventCount };
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

export interface MeterMarkerSelection {
  readonly markers: readonly MeterMarker[];
  readonly ignoredEventCount: number;
  readonly invalidEventCount: number;
}

/**
 * Imports every valid time-signature event. An event is ignored when it lands
 * on an already-used tick or does not fall on a measure boundary determined
 * by the previous meter. Consecutive equal signatures remain explicit.
 */
export function selectMeterMarkers(
  candidates: TimeSignatureCandidate[],
  sourcePpqn: number,
): MeterMarkerSelection {
  candidates.sort(compareMetaCandidates);
  const markers: MeterMarker[] = [];
  let ignoredEventCount = 0;
  let invalidEventCount = 0;
  let boundaryTick = 0;

  for (const candidate of candidates) {
    const event = candidate.event;

    if (
      !Number.isSafeInteger(event.numerator)
      || event.numerator <= 0
      || !isSupportedTimeSignatureDenominator(event.denominator)
    ) {
      invalidEventCount += 1;
      continue;
    }

    const timeSignature: TimeSignature = {
      numerator: event.numerator,
      denominator: event.denominator,
    };
    const startTick = convertTick(event.absoluteTick, sourcePpqn);

    if (markers.length === 0 && startTick === 0) {
      markers.push({ startTick: 0, timeSignature });
      continue;
    }

    if (markers.length === 0) {
      markers.push({
        startTick: 0,
        timeSignature: createDefaultTimeSignature(),
      });
      boundaryTick = 0;
    }

    const activeMarker = markers[markers.length - 1];

    if (activeMarker === undefined) {
      continue;
    }

    if (startTick <= activeMarker.startTick) {
      ignoredEventCount += 1;
      continue;
    }

    while (boundaryTick < startTick) {
      boundaryTick += getTicksPerMeasure(
        PROJECT_CONSTANTS.ppqn,
        activeMarker.timeSignature,
      );
    }

    if (boundaryTick !== startTick) {
      ignoredEventCount += 1;
      continue;
    }

    markers.push({ startTick, timeSignature });
  }

  if (markers.length === 0) {
    markers.push({
      startTick: 0,
      timeSignature: createDefaultTimeSignature(),
    });
  }

  return { markers, ignoredEventCount, invalidEventCount };
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
