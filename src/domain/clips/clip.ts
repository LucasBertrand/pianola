import {
  PROJECT_CONSTANTS,
} from "../../config/domain-limits";
import type {
  ClipId,
  InstrumentId,
  NoteId,
  Tick,
} from "../identifiers";
import type {
  Note,
} from "../notes/note";
import {
  createDefaultProjectClock,
  getTicksPerMeasure,
  type MeterMap,
  type ProjectClock,
  type TimeSignature,
  type TransportState,
} from "../transport/transport";

export const DEFAULT_MEASURE_COUNT =
  PROJECT_CONSTANTS.defaultMeasureCount;
export const MINIMUM_MEASURE_COUNT =
  PROJECT_CONSTANTS.minimumMeasureCount;
export const MAXIMUM_MEASURE_COUNT =
  PROJECT_CONSTANTS.maximumMeasureCount;
export const MAXIMUM_CLIP_NAME_LENGTH =
  PROJECT_CONSTANTS.maximumClipNameLength;
export const MAXIMUM_PROJECT_CLIP_COUNT =
  PROJECT_CONSTANTS.maximumClipCount;

/** Per-clip editing state for one global instrument. */
export interface ClipInstrumentState {
  readonly locked: boolean;
}

export interface Track {
  readonly instrumentId: InstrumentId;
  readonly notesById: Readonly<Record<NoteId, Note>>;
}

export interface ClipTimeline {
  readonly durationTicks: Tick;
  readonly meterMap: MeterMap;
}

/** Self-contained musical material rendered by the piano-roll editor. */
export interface Clip {
  readonly id: ClipId;
  readonly name: string;
  readonly timeline: ClipTimeline;
  readonly tracksByInstrumentId: Readonly<Record<InstrumentId, Track>>;
  readonly instrumentStatesById: Readonly<Record<InstrumentId, ClipInstrumentState>>;
  readonly transportSettings: TransportState;
}

export function createDefaultClipTimeline(
  clock: ProjectClock = createDefaultProjectClock(),
  measureCount: number = DEFAULT_MEASURE_COUNT,
): ClipTimeline {
  const timeSignature: TimeSignature = {
    numerator: PROJECT_CONSTANTS.defaultTimeSignatureNumerator,
    denominator: PROJECT_CONSTANTS.defaultTimeSignatureDenominator,
  };

  return {
    durationTicks: measureCount * getTicksPerMeasure(clock, timeSignature),
    meterMap: {
      segments: [{ startTick: 0, timeSignature }],
    },
  };
}

export function getClipDurationTicks(
  clip: Pick<Clip, "timeline">,
): number {
  return clip.timeline.durationTicks;
}

export function getClipTimeSignature(
  clip: Pick<Clip, "timeline">,
  tick: Tick = 0,
): TimeSignature {
  const segments = clip.timeline.meterMap.segments;
  let selected = segments[0];

  for (const segment of segments) {
    if (segment.startTick > tick) {
      break;
    }

    selected = segment;
  }

  if (selected === undefined) {
    throw new Error("A clip meter map must start at tick 0.");
  }

  return selected.timeSignature;
}

export function getClipMeasureCount(
  clock: ProjectClock,
  clip: Pick<Clip, "timeline">,
): number {
  const measureTicks = getTicksPerMeasure(
    clock,
    getClipTimeSignature(clip),
  );

  return clip.timeline.durationTicks / measureTicks;
}
