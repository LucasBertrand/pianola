import {
  PROJECT_CONSTANTS,
} from "../../config/domain-limits";
import {
  TONAL_SNAP_CONSTANTS,
} from "../../config/music-config";
import type {
  Tick,
} from "../identifiers";
import type {
  TonalPatternId,
  TonalPatternType,
} from "../../music/pitch-snap";


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

export function areTimeSignaturesEqual(
  first: TimeSignature,
  second: TimeSignature,
): boolean {
  if (
    first.numerator !== second.numerator
    || first.denominator !== second.denominator
  ) {
    return false;
  }

  const firstGroups = getBeatGroups(first);
  const secondGroups = getBeatGroups(second);

  return firstGroups.length === secondGroups.length
    && firstGroups.every(
      (group, index) => group === secondGroups[index],
    );
}

/** Beat grouping in denominator units; sums to the numerator. */
export function getBeatGroups(
  timeSignature: TimeSignature,
): readonly number[] {
  if (timeSignature.beatGroups !== undefined) {
    return timeSignature.beatGroups;
  }

  if (
    timeSignature.denominator >= 8
    && timeSignature.numerator % 3 === 0
  ) {
    return new Array<number>(
      timeSignature.numerator / 3,
    ).fill(3);
  }

  return new Array<number>(timeSignature.numerator).fill(1);
}

/** Duration of one denominator unit (e.g. one eighth note in x/8). */
export function getTicksPerBeatUnit(
  ppqn: number,
  timeSignature: TimeSignature,
): number {
  return ppqn * 4 / timeSignature.denominator;
}

export function getTicksPerMeasure(
  ppqn: number,
  timeSignature: TimeSignature,
): number {
  return getTicksPerBeatUnit(ppqn, timeSignature) * timeSignature.numerator;
}

/** Duration in ticks of each beat, following the beat grouping. */
export function getBeatTicks(
  ppqn: number,
  timeSignature: TimeSignature,
): readonly number[] {
  const unitTicks = getTicksPerBeatUnit(ppqn, timeSignature);

  return getBeatGroups(timeSignature).map((group) => group * unitTicks);
}

/** Beat boundary ticks inside a measure span, starting with the downbeat. */
export function getMeasureBeatBoundaryTicks(
  ppqn: number,
  span: MeasureSpan,
): readonly Tick[] {
  const boundaries: Tick[] = [];
  let tick = span.startTick;

  for (const beatTicks of getBeatTicks(ppqn, span.timeSignature)) {
    boundaries.push(tick);
    tick += beatTicks;
  }

  return boundaries;
}

/**
 * Grid subdivision ticks inside a measure span. Starting from the measure
 * downbeat, the grid advances by `resolutionTicks`; ticks at or past the
 * measure boundary are omitted, so overflowing resolutions (e.g. dotted 1/4
 * in 4/4) are naturally clipped. The downbeat itself is not included.
 */
export function getMeasureSubdivisionTicks(
  span: MeasureSpan,
  resolutionTicks: number,
): readonly Tick[] {
  if (
    !Number.isSafeInteger(resolutionTicks)
    || resolutionTicks <= 0
  ) {
    return [];
  }

  const ticks: Tick[] = [];
  let subdivisionTick = span.startTick + resolutionTicks;

  while (subdivisionTick < span.endTick) {
    ticks.push(subdivisionTick);
    subdivisionTick += resolutionTicks;
  }

  return ticks;
}

export function getMeterAtTick(
  timeMap: TimeMap,
  tick: Tick,
): TimeSignature {
  return getMarkerAtTick(timeMap.meterMarkers, tick).timeSignature;
}

export function getTempoAtTick(
  timeMap: TimeMap,
  tick: Tick,
): number {
  return getMarkerAtTick(timeMap.tempoMarkers, tick).bpm;
}

export function getScaleMarkerAtTick(
  timeMap: TimeMap,
  tick: Tick,
): ScaleMarker {
  return getMarkerAtTick(timeMap.scaleMarkers, tick);
}

/**
 * Measures covering `[0, durationTicks)`. When the duration does not end on
 * a measure boundary (an invalid clip), the final span keeps its full size
 * and extends past the duration so callers can still reason about it.
 */
export function getMeasureSpans(
  ppqn: number,
  timeMap: TimeMap,
  durationTicks: Tick,
): MeasureSpan[] {
  const spans: MeasureSpan[] = [];
  let markerIndex = 0;
  let spanStartTick = 0;
  let timeSignature = requireMarkerAtZero(
    timeMap.meterMarkers,
    "meter",
  ).timeSignature;

  while (spanStartTick < durationTicks) {
    const nextMarker = timeMap.meterMarkers[markerIndex + 1];
    const measureTicks = getTicksPerMeasure(ppqn, timeSignature);
    let spanEndTick = spanStartTick + measureTicks;

    if (
      nextMarker !== undefined
      && nextMarker.startTick <= spanEndTick
      && nextMarker.startTick > spanStartTick
    ) {
      spanEndTick = nextMarker.startTick;
    }

    spans.push({
      index: spans.length,
      startTick: spanStartTick,
      endTick: spanEndTick,
      timeSignature,
    });

    if (nextMarker !== undefined && nextMarker.startTick === spanEndTick) {
      markerIndex += 1;
      timeSignature = nextMarker.timeSignature;
    }

    spanStartTick = spanEndTick;
  }

  return spans;
}

export function getMeasureCount(
  ppqn: number,
  timeMap: TimeMap,
  durationTicks: Tick,
): number {
  return getMeasureSpans(ppqn, timeMap, durationTicks).length;
}

export function getMeasureSpanAtTick(
  ppqn: number,
  timeMap: TimeMap,
  durationTicks: Tick,
  tick: Tick,
): MeasureSpan {
  const spans = getMeasureSpans(ppqn, timeMap, durationTicks);
  const clampedTick = Math.min(
    Math.max(0, Math.floor(tick)),
    Math.max(0, durationTicks - 1),
  );
  const span = spans.find(
    (candidate) =>
      candidate.startTick <= clampedTick
      && clampedTick < candidate.endTick,
  );

  if (span === undefined) {
    throw new RangeError(
      `No measure span contains tick ${String(clampedTick)}.`,
    );
  }

  return span;
}

/**
 * Snaps a tick to the nearest measure-grid position. The measure boundary
 * (`span.endTick`) acts as the upper anchor when the last step within the
 * measure would overflow, so overflowing resolutions are naturally clipped.
 */
export function snapTickToMeasureGrid(
  ppqn: number,
  timeMap: TimeMap,
  durationTicks: Tick,
  tick: number,
  resolutionTicks: number,
): number {
  if (
    !Number.isFinite(tick)
    || !Number.isSafeInteger(resolutionTicks)
    || resolutionTicks <= 0
  ) {
    return tick;
  }

  const safeTick = Math.max(0, Math.min(durationTicks, Math.round(tick)));
  const span = getMeasureSpanAtTick(ppqn, timeMap, durationTicks, safeTick);
  const offset = safeTick - span.startTick;
  const lowerTick =
    span.startTick + Math.floor(offset / resolutionTicks) * resolutionTicks;
  const upperTick = Math.min(lowerTick + resolutionTicks, span.endTick);

  return safeTick - lowerTick <= upperTick - safeTick ? lowerTick : upperTick;
}

/**
 * Snaps a tick to the start of the grid cell it falls in, within its measure.
 * Equivalent to a floor-snap anchored at the measure downbeat.
 */
export function snapTickToMeasureCellStart(
  ppqn: number,
  timeMap: TimeMap,
  durationTicks: Tick,
  tick: number,
  resolutionTicks: number,
): number {
  if (
    !Number.isFinite(tick)
    || !Number.isSafeInteger(resolutionTicks)
    || resolutionTicks <= 0
  ) {
    return tick;
  }

  const safeTick = Math.max(
    0,
    Math.min(durationTicks - 1, Math.round(tick)),
  );
  const span = getMeasureSpanAtTick(ppqn, timeMap, durationTicks, safeTick);
  const offset = safeTick - span.startTick;

  return (
    span.startTick + Math.floor(offset / resolutionTicks) * resolutionTicks
  );
}

export function getMeasurePosition(
  ppqn: number,
  timeMap: TimeMap,
  durationTicks: Tick,
  tick: Tick,
): MeasurePosition {
  const span = getMeasureSpanAtTick(
    ppqn,
    timeMap,
    durationTicks,
    tick,
  );
  const tickInMeasure = Math.max(0, Math.floor(tick)) - span.startTick;
  let beatIndex = 0;
  let beatStartTick = 0;

  for (const beatTicks of getBeatTicks(ppqn, span.timeSignature)) {
    if (beatStartTick + beatTicks > tickInMeasure) {
      break;
    }

    beatStartTick += beatTicks;
    beatIndex += 1;
  }

  return {
    measureIndex: span.index,
    beatIndex,
    tickInBeat: tickInMeasure - beatStartTick,
  };
}

export function isMeasureBoundary(
  ppqn: number,
  timeMap: TimeMap,
  durationTicks: Tick,
  tick: Tick,
): boolean {
  if (!Number.isSafeInteger(tick) || tick <= 0 || tick >= durationTicks) {
    return false;
  }

  return getMeasureSpans(ppqn, timeMap, durationTicks).some(
    (span) => span.startTick === tick,
  );
}

/** Absolute seconds of a tick, walking the tempo markers cumulatively. */
export function tickToSeconds(
  ppqn: number,
  timeMap: TimeMap,
  tick: Tick,
): number {
  if (tick <= 0) {
    return 0;
  }

  let elapsedSeconds = 0;
  let segmentStartTick = 0;
  let bpm = requireMarkerAtZero(timeMap.tempoMarkers, "tempo").bpm;

  for (
    let markerIndex = 1;
    markerIndex < timeMap.tempoMarkers.length;
    markerIndex += 1
  ) {
    const marker = timeMap.tempoMarkers[markerIndex];

    if (marker === undefined || marker.startTick >= tick) {
      break;
    }

    elapsedSeconds +=
      (marker.startTick - segmentStartTick) * 60 / (bpm * ppqn);
    segmentStartTick = marker.startTick;
    bpm = marker.bpm;
  }

  return elapsedSeconds + (tick - segmentStartTick) * 60 / (bpm * ppqn);
}

/** Number of measures required to cover a tick with the given meter markers. */
export function getMeasureCountCoveringTick(
  ppqn: number,
  meterMarkers: readonly MeterMarker[],
  tick: Tick,
): number {
  let count = 0;
  let spanStartTick = 0;
  let markerIndex = 0;
  let timeSignature = requireMarkerAtZero(
    meterMarkers,
    "meter",
  ).timeSignature;

  while (spanStartTick < tick) {
    const measureTicks = getTicksPerMeasure(ppqn, timeSignature);
    const nextMarker = meterMarkers[markerIndex + 1];
    let spanEndTick = spanStartTick + measureTicks;

    if (
      nextMarker !== undefined
      && nextMarker.startTick <= spanEndTick
      && nextMarker.startTick > spanStartTick
    ) {
      spanEndTick = nextMarker.startTick;
    }

    count += 1;

    if (nextMarker !== undefined && nextMarker.startTick === spanEndTick) {
      markerIndex += 1;
      timeSignature = nextMarker.timeSignature;
    }

    spanStartTick = spanEndTick;
  }

  return Math.max(1, count);
}

/** Duration in ticks of the first `measureCount` measures. */
export function getDurationForMeasureCount(
  ppqn: number,
  meterMarkers: readonly MeterMarker[],
  measureCount: number,
): Tick {
  let durationTicks = 0;
  let markerIndex = 0;
  let timeSignature = requireMarkerAtZero(
    meterMarkers,
    "meter",
  ).timeSignature;

  for (let measure = 0; measure < measureCount; measure += 1) {
    durationTicks += getTicksPerMeasure(ppqn, timeSignature);

    const nextMarker = meterMarkers[markerIndex + 1];

    if (
      nextMarker !== undefined
      && nextMarker.startTick === durationTicks
    ) {
      markerIndex += 1;
      timeSignature = nextMarker.timeSignature;
    }
  }

  return durationTicks;
}

/**
 * Projects meter markers onto complete measure boundaries without moving
 * them backwards. Each marker keeps its requested absolute tick when that
 * tick is already a boundary; otherwise it advances to the first boundary
 * produced by the preceding meter. Point events remain tick-anchored.
 *
 * The clip end follows the same policy. It never shrinks during a meter edit
 * and grows only when required to end on a complete measure.
 */
function rebuildMeterStructure(
  ppqn: number,
  requestedMarkers: readonly MeterMarker[],
  tempoMarkers: readonly TempoMarker[],
  scaleMarkers: readonly ScaleMarker[],
  sectionMarkers: readonly SectionMarker[],
  minimumDurationTicks: Tick,
): {
  readonly timeMap: TimeMap;
  readonly durationTicks: Tick;
} {
  const sorted = normalizeMeterMarkers(requestedMarkers);
  const first = sorted[0];

  if (first === undefined || first.startTick !== 0) {
    throw new RangeError("Meter markers must start at tick 0.");
  }

  const meterMarkers: MeterMarker[] = [{
    startTick: 0,
    timeSignature: first.timeSignature,
  }];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = meterMarkers[meterMarkers.length - 1];
    const marker = sorted[index];

    if (previous === undefined || marker === undefined) {
      continue;
    }

    const measureTicks = getTicksPerMeasure(ppqn, previous.timeSignature);
    const distance = marker.startTick - previous.startTick;
    const measureOffset = Math.max(1, Math.ceil(distance / measureTicks));

    meterMarkers.push({
      ...marker,
      startTick: previous.startTick + measureOffset * measureTicks,
    });
  }

  const last = meterMarkers[meterMarkers.length - 1];

  if (last === undefined) {
    throw new RangeError("A meter map must contain an initial marker.");
  }

  const lastMeasureTicks = getTicksPerMeasure(ppqn, last.timeSignature);
  const remainingTicks = minimumDurationTicks - last.startTick;
  const remainingMeasureCount = Math.max(
    1,
    Math.ceil(remainingTicks / lastMeasureTicks),
  );
  const durationTicks =
    last.startTick + remainingMeasureCount * lastMeasureTicks;

  return {
    timeMap: {
      meterMarkers,
      tempoMarkers,
      scaleMarkers,
      sectionMarkers,
    },
    durationTicks,
  };
}

/**
 * Replaces the tick-0 meter. Following meter markers advance to the first
 * compatible boundary when necessary; point events keep their ticks.
 */
export function replaceInitialMeter(
  ppqn: number,
  timeMap: TimeMap,
  durationTicks: Tick,
  timeSignature: TimeSignature,
): {
  readonly timeMap: TimeMap;
  readonly durationTicks: Tick;
} {
  return rebuildMeterStructure(
    ppqn,
    timeMap.meterMarkers.map((marker, index) =>
      index === 0 ? { ...marker, timeSignature } : marker),
    timeMap.tempoMarkers,
    timeMap.scaleMarkers,
    timeMap.sectionMarkers,
    durationTicks,
  );
}

/** Sorts by tick and keeps the first marker of a duplicate tick. */
export function normalizeMeterMarkers(
  markers: readonly MeterMarker[],
): MeterMarker[] {
  const sorted = sortByTick(markers);
  const normalized: MeterMarker[] = [];

  for (const marker of sorted) {
    const previous = normalized[normalized.length - 1];

    if (previous !== undefined && previous.startTick === marker.startTick) {
      continue;
    }

    normalized.push(marker);
  }

  return normalized;
}

/** Sorts by tick and keeps the first marker of a duplicate tick. */
export function normalizeTempoMarkers(
  markers: readonly TempoMarker[],
): TempoMarker[] {
  const sorted = sortByTick(markers);
  const normalized: TempoMarker[] = [];

  for (const marker of sorted) {
    const previous = normalized[normalized.length - 1];

    if (previous !== undefined && previous.startTick === marker.startTick) {
      continue;
    }

    normalized.push(marker);
  }

  return normalized;
}

/** Sorts by tick and keeps the first marker of a duplicate tick. */
export function normalizeScaleMarkers(
  markers: readonly ScaleMarker[],
): ScaleMarker[] {
  const sorted = sortByTick(markers);
  const normalized: ScaleMarker[] = [];

  for (const marker of sorted) {
    const previous = normalized[normalized.length - 1];

    if (previous !== undefined && previous.startTick === marker.startTick) {
      continue;
    }

    normalized.push(marker);
  }

  return normalized;
}

/** Sorts by tick and keeps the first marker of a duplicate tick. */
export function normalizeSectionMarkers(
  markers: readonly SectionMarker[],
): SectionMarker[] {
  const sorted = sortByTick(markers);
  const normalized: SectionMarker[] = [];

  for (const marker of sorted) {
    const previous = normalized[normalized.length - 1];

    if (previous !== undefined && previous.startTick === marker.startTick) {
      continue;
    }

    normalized.push(marker);
  }

  return normalized;
}

export interface MeterMarkerEdit {
  readonly timeMap: TimeMap;
  readonly durationTicks: Tick;
}

/**
 * Adds a meter marker on an existing measure boundary. Following meter
 * markers advance only when needed to remain on complete boundaries. Point
 * events and the existing clip extent remain absolute lower bounds.
 */
export function insertMeterMarker(
  ppqn: number,
  timeMap: TimeMap,
  durationTicks: Tick,
  marker: MeterMarker,
): MeterMarkerEdit {
  if (marker.startTick <= 0) {
    throw new RangeError(
      "The initial meter marker cannot be replaced by insertion.",
    );
  }

  const spans = getMeasureSpans(ppqn, timeMap, durationTicks);
  const span = spans.find(
    (candidate) => candidate.startTick === marker.startTick,
  );

  if (span === undefined) {
    throw new RangeError(
      "A meter marker must start on a measure boundary.",
    );
  }

  if (timeMap.meterMarkers.some(
    (candidate) => candidate.startTick === marker.startTick,
  )) {
    throw new RangeError(
      "A meter marker already starts this measure.",
    );
  }

  return rebuildMeterStructure(
    ppqn,
    [
      ...timeMap.meterMarkers,
      marker,
    ],
    timeMap.tempoMarkers,
    timeMap.scaleMarkers,
    timeMap.sectionMarkers,
    durationTicks,
  );
}

/**
 * Changes the signature of a marker. Following meter markers advance to the
 * first compatible boundary when necessary. Point events keep their ticks.
 */
export function updateMeterMarker(
  ppqn: number,
  timeMap: TimeMap,
  durationTicks: Tick,
  startTick: Tick,
  timeSignature: TimeSignature,
): MeterMarkerEdit {
  const markerIndex = timeMap.meterMarkers.findIndex(
    (marker) => marker.startTick === startTick,
  );

  if (markerIndex < 0) {
    throw new RangeError(
      `No meter marker starts at tick ${String(startTick)}.`,
    );
  }

  return rebuildMeterStructure(
    ppqn,
    timeMap.meterMarkers.map((marker, index) =>
      index === markerIndex ? { ...marker, timeSignature } : marker),
    timeMap.tempoMarkers,
    timeMap.scaleMarkers,
    timeMap.sectionMarkers,
    durationTicks,
  );
}

/**
 * Removes a meter marker. The initial marker cannot be removed. Following
 * markers advance only when required by the preceding meter.
 */
export function removeMeterMarker(
  ppqn: number,
  timeMap: TimeMap,
  durationTicks: Tick,
  startTick: Tick,
): MeterMarkerEdit {
  const markerIndex = timeMap.meterMarkers.findIndex(
    (marker) => marker.startTick === startTick,
  );

  if (markerIndex < 0) {
    throw new RangeError(
      `No meter marker starts at tick ${String(startTick)}.`,
    );
  }

  if (markerIndex === 0) {
    throw new RangeError("The initial meter marker cannot be removed.");
  }

  return rebuildMeterStructure(
    ppqn,
    timeMap.meterMarkers.filter((_, index) => index !== markerIndex),
    timeMap.tempoMarkers,
    timeMap.scaleMarkers,
    timeMap.sectionMarkers,
    durationTicks,
  );
}

export function insertTempoMarker(
  timeMap: TimeMap,
  durationTicks: Tick,
  marker: TempoMarker,
): TimeMap {
  if (marker.startTick <= 0 || marker.startTick >= durationTicks) {
    throw new RangeError(
      "A tempo marker must start inside the clip, after tick 0.",
    );
  }

  assertPositiveBpm(marker.bpm);

  return {
    ...timeMap,
    tempoMarkers: normalizeTempoMarkers([
      ...timeMap.tempoMarkers,
      marker,
    ]),
  };
}

export function moveTempoMarker(
  timeMap: TimeMap,
  startTick: Tick,
  targetTick: Tick,
): TimeMap {
  const markerIndex = findMarkerIndex(
    timeMap.tempoMarkers,
    startTick,
    "tempo",
  );

  if (markerIndex === 0) {
    throw new RangeError("The initial tempo marker cannot be moved.");
  }

  const markers = timeMap.tempoMarkers;

  const moved = markers.map((candidate, index) =>
    index === markerIndex
      ? { ...candidate, startTick: targetTick }
      : candidate);

  return {
    ...timeMap,
    tempoMarkers: normalizeTempoMarkers(moved),
  };
}

export function updateTempoMarker(
  timeMap: TimeMap,
  startTick: Tick,
  bpm: number,
): TimeMap {
  findMarkerIndex(timeMap.tempoMarkers, startTick, "tempo");
  assertPositiveBpm(bpm);

  return {
    ...timeMap,
    tempoMarkers: timeMap.tempoMarkers.map((marker) =>
      marker.startTick === startTick ? { ...marker, bpm } : marker),
  };
}

export function removeTempoMarker(
  timeMap: TimeMap,
  startTick: Tick,
): TimeMap {
  const markerIndex = findMarkerIndex(
    timeMap.tempoMarkers,
    startTick,
    "tempo",
  );

  if (markerIndex === 0) {
    throw new RangeError("The initial tempo marker cannot be removed.");
  }

  return {
    ...timeMap,
    tempoMarkers: normalizeTempoMarkers(
      timeMap.tempoMarkers.filter(
        (marker) => marker.startTick !== startTick,
      ),
    ),
  };
}

export function insertScaleMarker(
  timeMap: TimeMap,
  durationTicks: Tick,
  marker: ScaleMarker,
): TimeMap {
  if (marker.startTick <= 0 || marker.startTick >= durationTicks) {
    throw new RangeError(
      "A scale marker must start inside the clip, after tick 0.",
    );
  }

  return {
    ...timeMap,
    scaleMarkers: normalizeScaleMarkers([
      ...timeMap.scaleMarkers,
      marker,
    ]),
  };
}

export function moveScaleMarker(
  timeMap: TimeMap,
  startTick: Tick,
  targetTick: Tick,
): TimeMap {
  const markerIndex = findMarkerIndex(
    timeMap.scaleMarkers,
    startTick,
    "scale",
  );

  if (markerIndex === 0) {
    throw new RangeError("The initial scale marker cannot be moved.");
  }

  const markers = timeMap.scaleMarkers;

  const moved = markers.map((candidate, index) =>
    index === markerIndex
      ? { ...candidate, startTick: targetTick }
      : candidate);

  return {
    ...timeMap,
    scaleMarkers: normalizeScaleMarkers(moved),
  };
}

export function updateScaleMarker(
  timeMap: TimeMap,
  startTick: Tick,
  changes: Partial<Omit<ScaleMarker, "startTick">>,
): TimeMap {
  findMarkerIndex(timeMap.scaleMarkers, startTick, "scale");

  return {
    ...timeMap,
    scaleMarkers: timeMap.scaleMarkers.map((marker) =>
      marker.startTick === startTick ? { ...marker, ...changes } : marker),
  };
}

export function removeScaleMarker(
  timeMap: TimeMap,
  startTick: Tick,
): TimeMap {
  const markerIndex = findMarkerIndex(
    timeMap.scaleMarkers,
    startTick,
    "scale",
  );

  if (markerIndex === 0) {
    throw new RangeError("The initial scale marker cannot be removed.");
  }

  return {
    ...timeMap,
    scaleMarkers: normalizeScaleMarkers(
      timeMap.scaleMarkers.filter(
        (marker) => marker.startTick !== startTick,
      ),
    ),
  };
}

export function insertSectionMarker(
  timeMap: TimeMap,
  durationTicks: Tick,
  marker: SectionMarker,
): TimeMap {
  if (marker.startTick < 0 || marker.startTick >= durationTicks) {
    throw new RangeError("A section marker must start inside the clip.");
  }

  assertSectionComment(marker.comment);

  if (timeMap.sectionMarkers.some(
    (candidate) => candidate.startTick === marker.startTick,
  )) {
    throw new RangeError("A section marker already exists at this position.");
  }

  return {
    ...timeMap,
    sectionMarkers: normalizeSectionMarkers([
      ...timeMap.sectionMarkers,
      marker,
    ]),
  };
}

export function moveSectionMarker(
  timeMap: TimeMap,
  startTick: Tick,
  targetTick: Tick,
): TimeMap {
  const markerIndex = findMarkerIndex(
    timeMap.sectionMarkers,
    startTick,
    "section",
  );
  const moved = timeMap.sectionMarkers.map((candidate, index) =>
    index === markerIndex
      ? { ...candidate, startTick: targetTick }
      : candidate);

  return {
    ...timeMap,
    sectionMarkers: normalizeSectionMarkers(moved),
  };
}

export function updateSectionMarker(
  timeMap: TimeMap,
  startTick: Tick,
  comment: string,
): TimeMap {
  findMarkerIndex(timeMap.sectionMarkers, startTick, "section");
  assertSectionComment(comment);

  return {
    ...timeMap,
    sectionMarkers: timeMap.sectionMarkers.map((marker) =>
      marker.startTick === startTick ? { ...marker, comment } : marker),
  };
}

export function removeSectionMarker(
  timeMap: TimeMap,
  startTick: Tick,
): TimeMap {
  findMarkerIndex(timeMap.sectionMarkers, startTick, "section");

  return {
    ...timeMap,
    sectionMarkers: normalizeSectionMarkers(
      timeMap.sectionMarkers.filter(
        (marker) => marker.startTick !== startTick,
      ),
    ),
  };
}

/**
 * Inserts time before a measure boundary. Point events at the boundary
 * belong to the material on the right and move with it. A meter marker at
 * the boundary stays so the inserted measure inherits the target meter;
 * following meter markers move with the original material.
 */
export function insertTimeIntoTimeMap(
  timeMap: TimeMap,
  insertionTick: Tick,
  insertedTicks: number,
): TimeMap {
  const shiftPointMarker = <T extends { readonly startTick: Tick }>(
    marker: T,
  ): T => ({
    ...marker,
    startTick: marker.startTick >= insertionTick && marker.startTick !== 0
      ? marker.startTick + insertedTicks
      : marker.startTick,
  });

  const shiftMeterMarker = (marker: MeterMarker): MeterMarker => ({
    ...marker,
    startTick: marker.startTick > insertionTick
      ? marker.startTick + insertedTicks
      : marker.startTick,
  });

  return {
    meterMarkers: timeMap.meterMarkers.map(shiftMeterMarker),
    tempoMarkers: normalizeTempoMarkers(
      timeMap.tempoMarkers.map(shiftPointMarker),
    ),
    scaleMarkers: normalizeScaleMarkers(
      timeMap.scaleMarkers.map(shiftPointMarker),
    ),
    sectionMarkers: normalizeSectionMarkers(
      timeMap.sectionMarkers.map((marker) => ({
        ...marker,
        startTick: marker.startTick >= insertionTick
          ? marker.startTick + insertedTicks
          : marker.startTick,
      })),
    ),
  };
}

/**
 * Removes whole measures spanning `[removalStartTick, removalEndTick)` as a
 * literal time splice. Markers inside the range are removed, later markers
 * shift left by the exact removed duration, and the state active at the
 * right edge is restored at the seam when needed.
 */
export function removeTimeFromTimeMap(
  ppqn: number,
  timeMap: TimeMap,
  durationTicks: Tick,
  removalStartTick: Tick,
  removalEndTick: Tick,
): MeterMarkerEdit {
  const spans = getMeasureSpans(ppqn, timeMap, durationTicks);
  const removedSpans = spans.filter(
    (span) =>
      span.startTick >= removalStartTick
      && span.startTick < removalEndTick,
  );
  const firstRemoved = removedSpans[0];
  const lastRemoved = removedSpans[removedSpans.length - 1];

  if (
    firstRemoved === undefined
    || lastRemoved === undefined
    || firstRemoved.startTick !== removalStartTick
    || lastRemoved.endTick !== removalEndTick
  ) {
    throw new RangeError(
      "A removed range must cover whole measures.",
    );
  }

  const removedTicks = removalEndTick - removalStartTick;
  const durationAfterRemoval = durationTicks - removedTicks;
  const shiftMarkers = <T extends { readonly startTick: Tick }>(
    markers: readonly T[],
  ): T[] => markers.flatMap((marker) => {
    if (
      marker.startTick >= removalStartTick
      && marker.startTick < removalEndTick
    ) {
      return [];
    }

    if (marker.startTick >= removalEndTick) {
      return [{
        ...marker,
        startTick: marker.startTick - removedTicks,
      }];
    }

    return [marker];
  });

  const shouldRestoreSeam = removalStartTick < durationAfterRemoval;
  const meterBeforeSeam = getMeterAtTick(
    timeMap,
    Math.max(0, removalStartTick - 1),
  );
  const meterAfterRemoval = getMeterAtTick(timeMap, removalEndTick);
  const shiftedMeterMarkers = shiftMarkers(timeMap.meterMarkers);
  const meterMarkers = normalizeMeterMarkers([
    ...shiftedMeterMarkers,
    ...(shouldRestoreSeam && (
      removalStartTick === 0
      || !areTimeSignaturesEqual(meterBeforeSeam, meterAfterRemoval)
    ) ? [{
      startTick: removalStartTick,
      timeSignature: meterAfterRemoval,
    }] : []),
  ]);

  const tempoBeforeSeam = getTempoAtTick(
    timeMap,
    Math.max(0, removalStartTick - 1),
  );
  const tempoAfterRemoval = getTempoAtTick(timeMap, removalEndTick);
  const tempoMarkers = normalizeTempoMarkers([
    ...shiftMarkers(timeMap.tempoMarkers),
    ...(shouldRestoreSeam && (
      removalStartTick === 0 || tempoBeforeSeam !== tempoAfterRemoval
    ) ? [{ startTick: removalStartTick, bpm: tempoAfterRemoval }] : []),
  ]);

  const scaleBeforeSeam = getScaleMarkerAtTick(
    timeMap,
    Math.max(0, removalStartTick - 1),
  );
  const scaleAfterRemoval = getScaleMarkerAtTick(timeMap, removalEndTick);
  const scaleChangesAtSeam =
    scaleBeforeSeam.rootNote !== scaleAfterRemoval.rootNote
    || scaleBeforeSeam.patternType !== scaleAfterRemoval.patternType
    || scaleBeforeSeam.patternId !== scaleAfterRemoval.patternId;
  const scaleMarkers = normalizeScaleMarkers([
    ...shiftMarkers(timeMap.scaleMarkers),
    ...(shouldRestoreSeam && (
      removalStartTick === 0 || scaleChangesAtSeam
    ) ? [{ ...scaleAfterRemoval, startTick: removalStartTick }] : []),
  ]);
  const sectionMarkers = normalizeSectionMarkers(
    shiftMarkers(timeMap.sectionMarkers),
  );

  return {
    timeMap: { meterMarkers, tempoMarkers, scaleMarkers, sectionMarkers },
    durationTicks: durationAfterRemoval,
  };
}

function assertSectionComment(comment: string): void {
  if (
    typeof comment !== "string"
    || comment.trim().length === 0
    || comment.length > PROJECT_CONSTANTS.maximumSectionCommentLength
  ) {
    throw new RangeError(
      "A section marker comment must be non-empty and at most 1000 characters.",
    );
  }
}

function getMarkerAtTick<T extends { readonly startTick: Tick }>(
  markers: readonly T[],
  tick: Tick,
): T {
  const initialMarker = requireMarkerAtZero(markers, "timeline");
  let lowerIndex = 0;
  let upperIndex = markers.length - 1;
  let selectedIndex = 0;

  while (lowerIndex <= upperIndex) {
    const middleIndex = Math.floor((lowerIndex + upperIndex) / 2);
    const marker = markers[middleIndex];

    if (marker === undefined) {
      break;
    }

    if (marker.startTick <= tick) {
      selectedIndex = middleIndex;
      lowerIndex = middleIndex + 1;
    } else {
      upperIndex = middleIndex - 1;
    }
  }

  return markers[selectedIndex] ?? initialMarker;
}

function requireMarkerAtZero<T extends { readonly startTick: Tick }>(
  markers: readonly T[],
  kind: string,
): T {
  const first = markers[0];

  if (first === undefined || first.startTick !== 0) {
    throw new RangeError(
      `A clip ${kind} map must start with a marker at tick 0.`,
    );
  }

  return first;
}

function findMarkerIndex(
  markers: readonly { readonly startTick: Tick }[],
  startTick: Tick,
  kind: string,
): number {
  const markerIndex = markers.findIndex(
    (marker) => marker.startTick === startTick,
  );

  if (markerIndex < 0) {
    throw new RangeError(
      `No ${kind} marker starts at tick ${String(startTick)}.`,
    );
  }

  return markerIndex;
}

function assertPositiveBpm(bpm: number): void {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new RangeError("A tempo marker BPM must be positive and finite.");
  }
}

function sortByTick<T extends { readonly startTick: Tick }>(
  markers: readonly T[],
): T[] {
  return [...markers].sort(
    (left, right) => left.startTick - right.startTick,
  );
}
