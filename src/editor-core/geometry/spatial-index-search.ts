import type {
  Note,
} from "../../domain/notes/note";
import {
  MAX_MIDI_PITCH,
  MIN_MIDI_PITCH,
} from "./converter";
import type {
  SpatialTouchEnvelope,
} from "./spatial-touch-envelope";

export const SPATIAL_SEARCH_BLOCK_SIZE = 32;

export interface SpatialIndexBucket {
  readonly notes: Note[];
  readonly blockMaxEndTicks: number[];
}

export function isValidTouchQuery(
  tick: number,
  pitch: number,
  envelope: SpatialTouchEnvelope,
): boolean {
  return (
    Number.isFinite(tick)
    && Number.isFinite(pitch)
    && Number.isFinite(envelope.tickRadius)
    && envelope.tickRadius >= 0
    && Number.isFinite(envelope.pitchRadius)
    && envelope.pitchRadius >= 0
  );
}

export function validateIndexableNotes(notes: readonly Note[]): void {
  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index];

    if (
      note === undefined
      || !Number.isInteger(note.pitch)
      || note.pitch < MIN_MIDI_PITCH
      || note.pitch > MAX_MIDI_PITCH
      || !Number.isSafeInteger(note.startTick)
      || note.startTick < 0
      || !Number.isSafeInteger(note.durationTicks)
      || note.durationTicks <= 0
    ) {
      throw new RangeError(
        `Note at index ${index} cannot be added to the spatial index.`,
      );
    }
  }
}

export function rebuildBlockMaxEndTicks(bucket: SpatialIndexBucket): void {
  const blockCount = Math.ceil(
    bucket.notes.length / SPATIAL_SEARCH_BLOCK_SIZE,
  );
  bucket.blockMaxEndTicks.length = blockCount;

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const blockStartIndex = blockIndex * SPATIAL_SEARCH_BLOCK_SIZE;
    const blockEndIndex = Math.min(
      blockStartIndex + SPATIAL_SEARCH_BLOCK_SIZE,
      bucket.notes.length,
    );
    let maxEndTick = Number.NEGATIVE_INFINITY;

    for (let noteIndex = blockStartIndex; noteIndex < blockEndIndex; noteIndex += 1) {
      const note = bucket.notes[noteIndex];

      if (note !== undefined) {
        maxEndTick = Math.max(
          maxEndTick,
          note.startTick + note.durationTicks,
        );
      }
    }

    bucket.blockMaxEndTicks[blockIndex] = maxEndTick;
  }
}

export function lowerBoundStartTick(
  notes: readonly Note[],
  tick: number,
): number {
  let low = 0;
  let high = notes.length;

  while (low < high) {
    const middle = low + ((high - low) >> 1);
    const note = notes[middle];

    if (note !== undefined && note.startTick < tick) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

export function upperBoundStartTick(
  notes: readonly Note[],
  tick: number,
): number {
  let low = 0;
  let high = notes.length;

  while (low < high) {
    const middle = low + ((high - low) >> 1);
    const note = notes[middle];

    if (note !== undefined && note.startTick <= tick) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

export function compareSpatialNotes(left: Note, right: Note): number {
  const startDifference = left.startTick - right.startTick;

  if (startDifference !== 0) {
    return startDifference;
  }

  const durationDifference = left.durationTicks - right.durationTicks;

  if (durationDifference !== 0) {
    return durationDifference;
  }

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function clampSpatialPitch(pitch: number): number {
  return Math.min(MAX_MIDI_PITCH, Math.max(MIN_MIDI_PITCH, pitch));
}
