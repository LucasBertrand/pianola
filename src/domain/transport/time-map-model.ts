import { PROJECT_CONSTANTS } from "../project/project-constants";
import { TONAL_SNAP_CONSTANTS } from "../music-theory/tonal-snap-constants";
import type { Tick } from "../identifiers";
import type {
  TonalPatternId,
  TonalPatternType,
} from "../music-theory/pitch-snap";

/**
 * Musical meter. `beatGroups` optionally spells the pulse grouping in
 * denominator units (7/8 as [2, 2, 3]); it must sum to `numerator`.
 * When omitted, compound meters (denominator >= 8, numerator multiple of 3)
 * group by 3 and every other meter uses one unit per beat.
 */
export interface TimeSignature {
  readonly numerator: number;
  readonly denominator: 1 | 2 | 4 | 8 | 16 | 32;
  readonly beatGroups?: readonly number[];
}

/** Meter change positioned on a measure boundary of a clip timeline. */
export interface MeterMarker {
  readonly startTick: Tick;
  readonly timeSignature: TimeSignature;
}

/** Tempo change positioned anywhere inside a clip timeline. */
export interface TempoMarker {
  readonly startTick: Tick;
  readonly bpm: number;
}

/** Scale change positioned anywhere inside a clip timeline. */
export interface ScaleMarker {
  readonly startTick: Tick;
  readonly rootNote: string;
  readonly patternType: TonalPatternType;
  readonly patternId: TonalPatternId;
}

/** Free-form section comment positioned anywhere inside a clip timeline. */
export interface SectionMarker {
  readonly startTick: Tick;
  readonly comment: string;
}

/**
 * Sole source of truth for the temporal structure of a clip. Every marker
 * list is sorted by tick and holds unique ticks. Meter, tempo, and scale
 * markers start at tick 0; section markers are optional point comments.
 */
export interface TimeMap {
  readonly meterMarkers: readonly MeterMarker[];
  readonly tempoMarkers: readonly TempoMarker[];
  readonly scaleMarkers: readonly ScaleMarker[];
  readonly sectionMarkers: readonly SectionMarker[];
}

/** One measure derived from a time map; the primary navigation primitive. */
export interface MeasureSpan {
  readonly index: number;
  readonly startTick: Tick;
  readonly endTick: Tick;
  readonly timeSignature: TimeSignature;
}

/** Musical position of a tick inside its measure. */
export interface MeasurePosition {
  readonly measureIndex: number;
  readonly beatIndex: number;
  readonly tickInBeat: number;
}

export function createDefaultTimeSignature(): TimeSignature {
  return {
    numerator: PROJECT_CONSTANTS.defaultTimeSignatureNumerator,
    denominator: PROJECT_CONSTANTS.defaultTimeSignatureDenominator,
  };
}

export function createDefaultTimeMap(
  timeSignature: TimeSignature = createDefaultTimeSignature(),
): TimeMap {
  return {
    meterMarkers: [{
      startTick: 0,
      timeSignature,
    }],
    tempoMarkers: [{
      startTick: 0,
      bpm: PROJECT_CONSTANTS.defaultTempoBpm,
    }],
    scaleMarkers: [{
      startTick: 0,
      rootNote: TONAL_SNAP_CONSTANTS.defaultRootNote,
      patternType: "scale",
      patternId: TONAL_SNAP_CONSTANTS.defaultPatternId,
    }],
    sectionMarkers: [],
  };
}
