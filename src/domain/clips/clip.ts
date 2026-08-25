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
  type ProjectClock,
  type TransportState,
} from "../transport/transport";
import {
  createDefaultTimeMap,
  createDefaultTimeSignature,
  getTicksPerMeasure,
  type TimeMap,
} from "../transport/time-map";

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
export const DEFAULT_CLIP_COLOR =
  PROJECT_CONSTANTS.defaultClipColor;
export const DEFAULT_CLIP_BYPASS_ENABLED =
  PROJECT_CONSTANTS.defaultClipBypassEnabled;

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
  readonly timeMap: TimeMap;
}

/** Self-contained musical material rendered by the piano-roll editor. */
export interface Clip {
  readonly id: ClipId;
  readonly name: string;
  readonly color: string;
  readonly bypassEnabled: boolean;
  readonly timeline: ClipTimeline;
  readonly tracksByInstrumentId: Readonly<Record<InstrumentId, Track>>;
  readonly instrumentStatesById: Readonly<Record<InstrumentId, ClipInstrumentState>>;
  readonly transportSettings: TransportState;
}

export function createDefaultClipTimeline(
  clock: ProjectClock = createDefaultProjectClock(),
  measureCount: number = DEFAULT_MEASURE_COUNT,
): ClipTimeline {
  const timeSignature = createDefaultTimeSignature();

  return {
    durationTicks: measureCount * getTicksPerMeasure(
      clock.ppqn,
      timeSignature,
    ),
    timeMap: createDefaultTimeMap(),
  };
}

export function getClipDurationTicks(
  clip: Pick<Clip, "timeline">,
): number {
  return clip.timeline.durationTicks;
}
