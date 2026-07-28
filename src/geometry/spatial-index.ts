import type {
  Note,
} from "../domain/model";
import {
  MAX_MIDI_PITCH,
  MIN_MIDI_PITCH,
} from "./converter";

const PITCH_BUCKET_COUNT = 128;
const SEARCH_BLOCK_SIZE = 32;

interface PitchBucket {
  readonly notes: Note[];
  readonly blockMaxEndTicks: number[];
}

export class SpatialIndex {
  private readonly buckets: PitchBucket[];
  private indexedNoteCount = 0;

  public constructor() {
    const buckets: PitchBucket[] = new Array<PitchBucket>(
      PITCH_BUCKET_COUNT,
    );

    for (let pitch = 0; pitch < PITCH_BUCKET_COUNT; pitch += 1) {
      buckets[pitch] = {
        notes: [],
        blockMaxEndTicks: [],
      };
    }

    this.buckets = buckets;
  }

  public get size(): number {
    return this.indexedNoteCount;
  }

  public update(notes: readonly Note[]): void {
    validateIndexableNotes(notes);
    this.clear();

    for (let index = 0; index < notes.length; index += 1) {
      const note = notes[index];

      if (note !== undefined) {
        this.buckets[note.pitch]?.notes.push(note);
      }
    }

    for (let pitch = 0; pitch < PITCH_BUCKET_COUNT; pitch += 1) {
      const bucket = this.buckets[pitch];

      if (bucket !== undefined && bucket.notes.length > 0) {
        bucket.notes.sort(compareNotes);
        rebuildBlockMaxEndTicks(bucket);
      }
    }

    this.indexedNoteCount = notes.length;
  }

  public clear(): void {
    for (let pitch = 0; pitch < PITCH_BUCKET_COUNT; pitch += 1) {
      const bucket = this.buckets[pitch];

      if (bucket !== undefined) {
        bucket.notes.length = 0;
        bucket.blockMaxEndTicks.length = 0;
      }
    }

    this.indexedNoteCount = 0;
  }

  public queryPoint(tick: number, pitch: number): Note | undefined {
    if (
      !Number.isFinite(tick)
      || !Number.isInteger(pitch)
      || pitch < MIN_MIDI_PITCH
      || pitch > MAX_MIDI_PITCH
    ) {
      return undefined;
    }

    const bucket = this.buckets[pitch];

    if (bucket === undefined || bucket.notes.length === 0) {
      return undefined;
    }

    let candidateIndex = upperBoundStartTick(bucket.notes, tick) - 1;

    while (candidateIndex >= 0) {
      const blockIndex = Math.floor(candidateIndex / SEARCH_BLOCK_SIZE);
      const blockMaxEndTick = bucket.blockMaxEndTicks[blockIndex];

      if (
        blockMaxEndTick !== undefined
        && blockMaxEndTick > tick
      ) {
        const blockStartIndex = blockIndex * SEARCH_BLOCK_SIZE;

        for (
          let noteIndex = candidateIndex;
          noteIndex >= blockStartIndex;
          noteIndex -= 1
        ) {
          const note = bucket.notes[noteIndex];

          if (
            note !== undefined
            && tick >= note.startTick
            && tick < note.startTick + note.durationTicks
          ) {
            return note;
          }
        }
      }

      candidateIndex = blockIndex * SEARCH_BLOCK_SIZE - 1;
    }

    return undefined;
  }

  public queryRect(
    startTick: number,
    endTick: number,
    minPitch: number,
    maxPitch: number,
    target?: Note[],
  ): Note[] {
    const result = target ?? [];
    result.length = 0;

    if (
      !Number.isFinite(startTick)
      || !Number.isFinite(endTick)
      || startTick >= endTick
      || !Number.isFinite(minPitch)
      || !Number.isFinite(maxPitch)
      || minPitch > maxPitch
      || maxPitch < MIN_MIDI_PITCH
      || minPitch > MAX_MIDI_PITCH
    ) {
      return result;
    }

    const firstPitch = clampPitch(Math.ceil(minPitch));
    const lastPitch = clampPitch(Math.floor(maxPitch));

    if (firstPitch > lastPitch) {
      return result;
    }

    for (let pitch = firstPitch; pitch <= lastPitch; pitch += 1) {
      const bucket = this.buckets[pitch];

      if (bucket === undefined || bucket.notes.length === 0) {
        continue;
      }

      const candidateEndIndex = lowerBoundStartTick(
        bucket.notes,
        endTick,
      );
      const lastBlockIndex = Math.floor(
        (candidateEndIndex - 1) / SEARCH_BLOCK_SIZE,
      );

      for (
        let blockIndex = 0;
        blockIndex <= lastBlockIndex;
        blockIndex += 1
      ) {
        const blockMaxEndTick = bucket.blockMaxEndTicks[blockIndex];

        if (
          blockMaxEndTick === undefined
          || blockMaxEndTick <= startTick
        ) {
          continue;
        }

        const blockStartIndex = blockIndex * SEARCH_BLOCK_SIZE;
        const blockEndIndex = Math.min(
          blockStartIndex + SEARCH_BLOCK_SIZE,
          candidateEndIndex,
        );

        for (
          let noteIndex = blockStartIndex;
          noteIndex < blockEndIndex;
          noteIndex += 1
        ) {
          const note = bucket.notes[noteIndex];

          if (
            note !== undefined
            && note.startTick < endTick
            && note.startTick + note.durationTicks > startTick
          ) {
            result.push(note);
          }
        }
      }
    }

    return result;
  }
}

function validateIndexableNotes(notes: readonly Note[]): void {
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

function rebuildBlockMaxEndTicks(bucket: PitchBucket): void {
  const blockCount = Math.ceil(
    bucket.notes.length / SEARCH_BLOCK_SIZE,
  );
  bucket.blockMaxEndTicks.length = blockCount;

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const blockStartIndex = blockIndex * SEARCH_BLOCK_SIZE;
    const blockEndIndex = Math.min(
      blockStartIndex + SEARCH_BLOCK_SIZE,
      bucket.notes.length,
    );
    let maxEndTick = Number.NEGATIVE_INFINITY;

    for (
      let noteIndex = blockStartIndex;
      noteIndex < blockEndIndex;
      noteIndex += 1
    ) {
      const note = bucket.notes[noteIndex];

      if (note !== undefined) {
        const endTick = note.startTick + note.durationTicks;

        if (endTick > maxEndTick) {
          maxEndTick = endTick;
        }
      }
    }

    bucket.blockMaxEndTicks[blockIndex] = maxEndTick;
  }
}

function lowerBoundStartTick(notes: readonly Note[], tick: number): number {
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

function upperBoundStartTick(notes: readonly Note[], tick: number): number {
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

function compareNotes(left: Note, right: Note): number {
  const startDifference = left.startTick - right.startTick;

  if (startDifference !== 0) {
    return startDifference;
  }

  const durationDifference = left.durationTicks - right.durationTicks;

  if (durationDifference !== 0) {
    return durationDifference;
  }

  if (left.id < right.id) {
    return -1;
  }

  if (left.id > right.id) {
    return 1;
  }

  return 0;
}

function clampPitch(pitch: number): number {
  if (pitch < MIN_MIDI_PITCH) {
    return MIN_MIDI_PITCH;
  }

  if (pitch > MAX_MIDI_PITCH) {
    return MAX_MIDI_PITCH;
  }

  return pitch;
}
