import type {
  Tick,
} from "../domain/identifiers";
import type {
  TransportState,
} from "../domain/transport/transport";
import type {
  AudioEnginePort,
  PlaybackInstrumentSnapshot,
  PlaybackSnapshot,
} from "./playback-model";

const SCHEDULING_EPSILON_TICKS = 1e-7;

export interface PlaybackOccurrenceScheduleContext {
  readonly engine: AudioEnginePort;
  readonly snapshot: PlaybackSnapshot;
  readonly transport: TransportState;
  readonly generation: number;
  readonly loopingForAnchor: boolean;
  readonly positionTick: Tick;
  readonly anchorAudioTimeSeconds: number;
  readonly unwrappedTickToAudioTime: (tick: number) => number;
}

/** Schedules every note start covered by one unwrapped lookahead range. */
export function schedulePlaybackOccurrences(
  context: PlaybackOccurrenceScheduleContext,
  startUnwrappedTick: number,
  endUnwrappedTick: number,
): void {
  if (endUnwrappedTick <= startUnwrappedTick) {
    return;
  }

  if (!context.loopingForAnchor) {
    scheduleProjectRange(
      context,
      Math.max(0, startUnwrappedTick),
      Math.min(context.snapshot.durationTicks, endUnwrappedTick),
      0,
      context.snapshot.durationTicks,
      0,
    );
    return;
  }

  const loop = context.transport.loop;
  const loopDurationTicks = loop.endTick - loop.startTick;
  let cursor = startUnwrappedTick;

  while (cursor < endUnwrappedTick - SCHEDULING_EPSILON_TICKS) {
    if (cursor < loop.endTick) {
      const segmentEnd = Math.min(endUnwrappedTick, loop.endTick);

      scheduleProjectRange(
        context,
        cursor,
        segmentEnd,
        0,
        loop.endTick,
        0,
      );
      cursor = segmentEnd;
      continue;
    }

    const cycleIndex = Math.floor(
      (cursor - loop.endTick) / loopDurationTicks,
    );
    const cycleStartUnwrappedTick =
      loop.endTick + cycleIndex * loopDurationTicks;
    const segmentEndUnwrappedTick = Math.min(
      endUnwrappedTick,
      cycleStartUnwrappedTick + loopDurationTicks,
    );
    const projectStartTick =
      loop.startTick + cursor - cycleStartUnwrappedTick;
    const projectEndTick =
      loop.startTick + segmentEndUnwrappedTick - cycleStartUnwrappedTick;
    const unwrappedOffsetTicks = cycleStartUnwrappedTick - loop.startTick;

    scheduleProjectRange(
      context,
      projectStartTick,
      projectEndTick,
      unwrappedOffsetTicks,
      cycleStartUnwrappedTick + loopDurationTicks,
      cycleIndex + 1,
    );
    cursor = segmentEndUnwrappedTick;
  }
}

/** Resumes notes crossing the play anchor without replaying their attacks. */
export function scheduleHeldNotesAtAnchor(
  context: PlaybackOccurrenceScheduleContext,
): void {
  const anchorTick = context.positionTick;

  if (anchorTick <= 0 || anchorTick >= context.snapshot.durationTicks) {
    return;
  }

  const hasSoloInstrument = snapshotHasSoloInstrument(context.snapshot);
  const boundaryTick = context.loopingForAnchor
    ? context.transport.loop.endTick
    : context.snapshot.durationTicks;
  const minimumStartTick =
    context.loopingForAnchor
    && anchorTick >= context.transport.loop.startTick
      ? context.transport.loop.startTick
      : 0;

  for (const instrument of context.snapshot.instruments) {
    if (!isInstrumentAudible(instrument, hasSoloInstrument)) {
      continue;
    }

    const endIndex = lowerBound(instrument.startTicks, anchorTick);

    for (let noteIndex = 0; noteIndex < endIndex; noteIndex += 1) {
      const noteStartTick = instrument.startTicks[noteIndex];
      const durationTicks = instrument.durationTicks[noteIndex];
      const pitch = instrument.pitches[noteIndex];
      const velocity = instrument.velocities[noteIndex];
      const noteId = instrument.noteIds[noteIndex];

      if (
        noteStartTick === undefined
        || durationTicks === undefined
        || pitch === undefined
        || velocity === undefined
        || noteId === undefined
        || noteStartTick < minimumStartTick
        || noteStartTick + durationTicks <= anchorTick
      ) {
        continue;
      }

      const endTick = Math.min(boundaryTick, noteStartTick + durationTicks);

      if (endTick > anchorTick) {
        context.engine.scheduleNote({
          occurrenceId:
            `${context.generation}:held:${instrument.instrumentId}:${noteId}`,
          generation: context.generation,
          instrument,
          pitch,
          velocity,
          startAudioTimeSeconds: context.anchorAudioTimeSeconds,
          endAudioTimeSeconds: context.unwrappedTickToAudioTime(endTick),
        });
      }
    }
  }
}

function scheduleProjectRange(
  context: PlaybackOccurrenceScheduleContext,
  projectStartTick: number,
  projectEndTick: number,
  unwrappedOffsetTicks: number,
  boundaryUnwrappedTick: number,
  loopIteration: number,
): void {
  if (projectEndTick <= projectStartTick) {
    return;
  }

  const hasSoloInstrument = snapshotHasSoloInstrument(context.snapshot);

  for (const instrument of context.snapshot.instruments) {
    if (!isInstrumentAudible(instrument, hasSoloInstrument)) {
      continue;
    }

    let noteIndex = lowerBound(instrument.startTicks, projectStartTick);

    while (noteIndex < instrument.startTicks.length) {
      const noteStartTick = instrument.startTicks[noteIndex];

      if (noteStartTick === undefined || noteStartTick >= projectEndTick) {
        break;
      }

      const durationTicks = instrument.durationTicks[noteIndex];
      const pitch = instrument.pitches[noteIndex];
      const velocity = instrument.velocities[noteIndex];
      const noteId = instrument.noteIds[noteIndex];

      if (
        durationTicks !== undefined
        && pitch !== undefined
        && velocity !== undefined
        && noteId !== undefined
      ) {
        const startUnwrappedTick = noteStartTick + unwrappedOffsetTicks;
        const endUnwrappedTick = Math.min(
          boundaryUnwrappedTick,
          startUnwrappedTick + durationTicks,
        );

        if (endUnwrappedTick > startUnwrappedTick) {
          context.engine.scheduleNote({
            occurrenceId:
              `${context.generation}:${loopIteration}:${instrument.instrumentId}:${noteId}`,
            generation: context.generation,
            instrument,
            pitch,
            velocity,
            startAudioTimeSeconds:
              context.unwrappedTickToAudioTime(startUnwrappedTick),
            endAudioTimeSeconds:
              context.unwrappedTickToAudioTime(endUnwrappedTick),
          });
        }
      }

      noteIndex += 1;
    }
  }
}

function lowerBound(values: Float64Array, target: number): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const value = values[middle];

    if (value !== undefined && value < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function snapshotHasSoloInstrument(snapshot: PlaybackSnapshot): boolean {
  return snapshot.instruments.some((instrument) => instrument.solo);
}

function isInstrumentAudible(
  instrument: PlaybackInstrumentSnapshot,
  hasSoloInstrument: boolean,
): boolean {
  return !instrument.muted && (!hasSoloInstrument || instrument.solo);
}
