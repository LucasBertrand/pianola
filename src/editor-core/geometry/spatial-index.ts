import {
  type Note,
} from "../../domain/notes/note";
import {
  MAX_MIDI_PITCH,
  MIN_MIDI_PITCH,
} from "./converter";
import {
  SPATIAL_SEARCH_BLOCK_SIZE,
  clampSpatialPitch,
  compareSpatialNotes,
  isValidTouchQuery,
  lowerBoundStartTick,
  rebuildBlockMaxEndTicks,
  upperBoundStartTick,
  validateIndexableNotes,
  type SpatialIndexBucket,
} from "./spatial-index-search";
import type {
  SpatialTouchEnvelope,
} from "./spatial-touch-envelope";

export type {
  SpatialTouchEnvelope,
} from "./spatial-touch-envelope";

const PITCH_BUCKET_COUNT =
  MAX_MIDI_PITCH - MIN_MIDI_PITCH + 1;
const TOUCH_QUERY_END_EPSILON_TICKS = 0.000_001;

export type SpatialNoteEdge = "start" | "end";

export interface SpatialNoteEdgeHit {
  readonly note: Note;
  readonly edge: SpatialNoteEdge;
  readonly distanceTicks: number;
}

export type SpatialNotePredicate = (note: Note) => boolean;
export type SpatialNoteComparator = (left: Note, right: Note) => number;

export class SpatialIndex {
  private readonly buckets: SpatialIndexBucket[];
  private readonly touchQueryBuffer: Note[] = [];
  private indexedNoteCount = 0;

  public constructor() {
    const buckets: SpatialIndexBucket[] = new Array<SpatialIndexBucket>(
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
        bucket.notes.sort(compareSpatialNotes);
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

  public queryPoint(
    tick: number,
    pitch: number,
    predicate?: SpatialNotePredicate,
    priorityComparator?: SpatialNoteComparator,
  ): Note | undefined {
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
    let preferredNote: Note | undefined;

    while (candidateIndex >= 0) {
      const blockIndex = Math.floor(candidateIndex / SPATIAL_SEARCH_BLOCK_SIZE);
      const blockMaxEndTick = bucket.blockMaxEndTicks[blockIndex];

      if (
        blockMaxEndTick !== undefined
        && blockMaxEndTick > tick
      ) {
        const blockStartIndex = blockIndex * SPATIAL_SEARCH_BLOCK_SIZE;

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
            && (predicate === undefined || predicate(note))
          ) {
            if (priorityComparator === undefined) {
              return note;
            }

            if (
              preferredNote === undefined
              || priorityComparator(note, preferredNote) > 0
            ) {
              preferredNote = note;
            }
          }
        }
      }

      candidateIndex = blockIndex * SPATIAL_SEARCH_BLOCK_SIZE - 1;
    }

    return preferredNote;
  }

  public queryPointWithEnvelope(
    tick: number,
    pitch: number,
    envelope: SpatialTouchEnvelope,
    predicate?: SpatialNotePredicate,
    priorityComparator?: SpatialNoteComparator,
  ): Note | undefined {
    if (!isValidTouchQuery(tick, pitch, envelope)) {
      return undefined;
    }

    if (
      envelope.tickRadius === 0
      && envelope.pitchRadius === 0
    ) {
      return this.queryPoint(
        tick,
        pitch,
        predicate,
        priorityComparator,
      );
    }

    const candidates = this.touchQueryBuffer;

    this.queryRect(
      tick
        - envelope.tickRadius
        - TOUCH_QUERY_END_EPSILON_TICKS,
      tick
        + envelope.tickRadius
        + TOUCH_QUERY_END_EPSILON_TICKS,
      pitch - envelope.pitchRadius,
      pitch + envelope.pitchRadius,
      candidates,
    );

    let closestNote: Note | undefined;
    let closestPitchDistance = Number.POSITIVE_INFINITY;
    let closestTickDistance = Number.POSITIVE_INFINITY;

    for (
      let candidateIndex = 0;
      candidateIndex < candidates.length;
      candidateIndex += 1
    ) {
      const note = candidates[candidateIndex];

      if (note === undefined) {
        continue;
      }

      if (predicate !== undefined && !predicate(note)) {
        continue;
      }

      const pitchDistance = Math.abs(note.pitch - pitch);
      const noteEndTick = note.startTick + note.durationTicks;
      const tickDistance =
        tick < note.startTick
          ? note.startTick - tick
          : tick > noteEndTick
            ? tick - noteEndTick
            : 0;

      if (
        pitchDistance < closestPitchDistance
        || (
          pitchDistance === closestPitchDistance
          && tickDistance < closestTickDistance
        )
        || (
          pitchDistance === closestPitchDistance
          && tickDistance === closestTickDistance
          && closestNote !== undefined
          && priorityComparator !== undefined
          && priorityComparator(note, closestNote) > 0
        )
      ) {
        closestNote = note;
        closestPitchDistance = pitchDistance;
        closestTickDistance = tickDistance;
      }
    }

    return closestNote;
  }

  public queryNoteEdge(
    tick: number,
    pitch: number,
    envelope: SpatialTouchEnvelope,
    predicate?: SpatialNotePredicate,
    priorityComparator?: SpatialNoteComparator,
  ): SpatialNoteEdgeHit | undefined {
    if (!isValidTouchQuery(tick, pitch, envelope)) {
      return undefined;
    }

    const candidates = this.touchQueryBuffer;

    this.queryRect(
      tick
        - envelope.tickRadius
        - TOUCH_QUERY_END_EPSILON_TICKS,
      tick
        + envelope.tickRadius
        + TOUCH_QUERY_END_EPSILON_TICKS,
      pitch - envelope.pitchRadius,
      pitch + envelope.pitchRadius,
      candidates,
    );

    let closestNote: Note | undefined;
    let closestEdge: SpatialNoteEdge = "start";
    let closestPitchDistance = Number.POSITIVE_INFINITY;
    let closestTickDistance = Number.POSITIVE_INFINITY;

    for (
      let candidateIndex = 0;
      candidateIndex < candidates.length;
      candidateIndex += 1
    ) {
      const note = candidates[candidateIndex];

      if (note === undefined) {
        continue;
      }

      if (predicate !== undefined && !predicate(note)) {
        continue;
      }

      const pitchDistance = Math.abs(note.pitch - pitch);
      const startDistance = Math.abs(note.startTick - tick);
      const endDistance = Math.abs(
        note.startTick + note.durationTicks - tick,
      );
      const edge =
        startDistance <= endDistance ? "start" : "end";
      const tickDistance = Math.min(
        startDistance,
        endDistance,
      );

      if (
        tickDistance <= envelope.tickRadius
        && (
          pitchDistance < closestPitchDistance
          || (
            pitchDistance === closestPitchDistance
            && tickDistance < closestTickDistance
          )
          || (
            pitchDistance === closestPitchDistance
            && tickDistance === closestTickDistance
            && closestNote !== undefined
            && priorityComparator !== undefined
            && priorityComparator(note, closestNote) > 0
          )
        )
      ) {
        closestNote = note;
        closestEdge = edge;
        closestPitchDistance = pitchDistance;
        closestTickDistance = tickDistance;
      }
    }

    if (closestNote === undefined) {
      return undefined;
    }

    return {
      note: closestNote,
      edge: closestEdge,
      distanceTicks: closestTickDistance,
    };
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

    const firstPitch = clampSpatialPitch(Math.ceil(minPitch));
    const lastPitch = clampSpatialPitch(Math.floor(maxPitch));

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
        (candidateEndIndex - 1) / SPATIAL_SEARCH_BLOCK_SIZE,
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

        const blockStartIndex = blockIndex * SPATIAL_SEARCH_BLOCK_SIZE;
        const blockEndIndex = Math.min(
          blockStartIndex + SPATIAL_SEARCH_BLOCK_SIZE,
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
