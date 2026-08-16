import {
  PROJECT_CONSTANTS,
} from "../../config/domain-limits";
import type {
  Tick,
} from "../identifiers";

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

/**
 * Sole source of truth for the temporal structure of a clip. Both marker
 * lists are sorted by tick, hold unique ticks and start at tick 0.
 */
export interface TimeMap {
  readonly meterMarkers: readonly MeterMarker[];
  readonly tempoMarkers: readonly TempoMarker[];
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

export function createDefaultTimeMap(): TimeMap {
  return {
    meterMarkers: [{
      startTick: 0,
      timeSignature: createDefaultTimeSignature(),
    }],
    tempoMarkers: [{
      startTick: 0,
      bpm: PROJECT_CONSTANTS.defaultTempoBpm,
    }],
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

interface MeterAnchor {
  readonly measureIndex: number;
  readonly timeSignature: TimeSignature;
}

/**
 * Rebuilds meter marker ticks from measure indices: markers are anchored to
 * measure positions, so any meter change recomputes the ticks of every
 * following marker. Tempo markers stay tick-anchored; markers past the new
 * duration are dropped. Returns the rebuilt map and the clip duration.
 */
function rebuildMeterStructure(
  ppqn: number,
  anchors: readonly MeterAnchor[],
  tempoMarkers: readonly TempoMarker[],
  measureCount: number,
): {
  readonly timeMap: TimeMap;
  readonly durationTicks: Tick;
} {
  const sorted = mergeAdjacentIdenticalAnchors(
    [...anchors].sort((left, right) => left.measureIndex - right.measureIndex),
  );
  const first = sorted[0];

  if (first === undefined || first.measureIndex !== 0) {
    throw new RangeError("Meter anchors must start at measure 0.");
  }

  const meterMarkers: MeterMarker[] = [{
    startTick: 0,
    timeSignature: first.timeSignature,
  }];
  let tick = 0;

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const anchor = sorted[index];

    if (previous === undefined || anchor === undefined) {
      continue;
    }

    tick +=
      (anchor.measureIndex - previous.measureIndex)
      * getTicksPerMeasure(ppqn, previous.timeSignature);
    meterMarkers.push({
      startTick: tick,
      timeSignature: anchor.timeSignature,
    });
  }

  const last = sorted[sorted.length - 1];
  const durationTicks =
    tick
    + (measureCount - (last?.measureIndex ?? 0))
      * getTicksPerMeasure(ppqn, last?.timeSignature ?? first.timeSignature);

  return {
    timeMap: {
      meterMarkers,
      tempoMarkers: tempoMarkers.filter(
        (marker) => marker.startTick < durationTicks,
      ),
    },
    durationTicks,
  };
}

function mergeAdjacentIdenticalAnchors(
  anchors: MeterAnchor[],
): MeterAnchor[] {
  const merged: MeterAnchor[] = [];

  for (const anchor of anchors) {
    const previous = merged[merged.length - 1];

    if (
      previous !== undefined
      && areTimeSignaturesEqual(
        previous.timeSignature,
        anchor.timeSignature,
      )
    ) {
      continue;
    }

    merged.push(anchor);
  }

  return merged;
}

function getMeterAnchors(
  ppqn: number,
  timeMap: TimeMap,
  durationTicks: Tick,
): MeterAnchor[] {
  const spans = getMeasureSpans(ppqn, timeMap, durationTicks);

  return timeMap.meterMarkers.map((marker) => {
    const span = spans.find(
      (candidate) => candidate.startTick === marker.startTick,
    );

    if (span === undefined) {
      throw new RangeError(
        "Every meter marker must start on a measure boundary.",
      );
    }

    return {
      measureIndex: span.index,
      timeSignature: marker.timeSignature,
    };
  });
}

/**
 * Replaces the tick-0 meter while keeping every other marker at its current
 * measure index and preserving the total measure count.
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
  const anchors = getMeterAnchors(ppqn, timeMap, durationTicks);

  return rebuildMeterStructure(
    ppqn,
    anchors.map((anchor, index) =>
      index === 0 ? { ...anchor, timeSignature } : anchor),
    timeMap.tempoMarkers,
    getMeasureSpans(ppqn, timeMap, durationTicks).length,
  );
}

/** Sorts by tick, keeps the first marker of a duplicate tick and merges
 * adjacent identical signatures. */
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

    if (
      previous !== undefined
      && areTimeSignaturesEqual(
        previous.timeSignature,
        marker.timeSignature,
      )
    ) {
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

    if (previous !== undefined && previous.bpm === marker.bpm) {
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
 * Adds a meter marker on the measure boundary containing `marker.startTick`.
 * The measure count is preserved; following markers keep their measure index
 * and their ticks are recomputed.
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

  if (areTimeSignaturesEqual(span.timeSignature, marker.timeSignature)) {
    throw new RangeError(
      "The marker is identical to the active meter.",
    );
  }

  const anchors = getMeterAnchors(ppqn, timeMap, durationTicks);

  if (anchors.some((anchor) => anchor.measureIndex === span.index)) {
    throw new RangeError(
      "A meter marker already starts this measure.",
    );
  }

  return rebuildMeterStructure(
    ppqn,
    [
      ...anchors,
      {
        measureIndex: span.index,
        timeSignature: marker.timeSignature,
      },
    ],
    timeMap.tempoMarkers,
    spans.length,
  );
}

/**
 * Moves a meter marker to another measure boundary. The target must keep the
 * marker strictly between its neighbours in measure order.
 */
export function moveMeterMarker(
  ppqn: number,
  timeMap: TimeMap,
  durationTicks: Tick,
  startTick: Tick,
  targetTick: Tick,
): MeterMarkerEdit {
  const spans = getMeasureSpans(ppqn, timeMap, durationTicks);
  const anchors = getMeterAnchors(ppqn, timeMap, durationTicks);
  const markerIndex = timeMap.meterMarkers.findIndex(
    (marker) => marker.startTick === startTick,
  );

  if (markerIndex < 0) {
    throw new RangeError(
      `No meter marker starts at tick ${String(startTick)}.`,
    );
  }

  if (markerIndex === 0) {
    throw new RangeError("The initial meter marker cannot be moved.");
  }

  const targetSpan = spans.find(
    (candidate) => candidate.startTick === targetTick,
  );

  if (targetSpan === undefined) {
    throw new RangeError(
      "A meter marker must start on a measure boundary.",
    );
  }

  return rebuildMeterStructure(
    ppqn,
    anchors.map((anchor, index) =>
      index === markerIndex
        ? { ...anchor, measureIndex: targetSpan.index }
        : anchor),
    timeMap.tempoMarkers,
    spans.length,
  );
}

/**
 * Changes the signature of a marker. Following markers keep their measure
 * index; when the marker becomes identical to its predecessor it is merged
 * away.
 */
export function updateMeterMarker(
  ppqn: number,
  timeMap: TimeMap,
  durationTicks: Tick,
  startTick: Tick,
  timeSignature: TimeSignature,
): MeterMarkerEdit {
  const anchors = getMeterAnchors(ppqn, timeMap, durationTicks);
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
    anchors.map((anchor, index) =>
      index === markerIndex ? { ...anchor, timeSignature } : anchor),
    timeMap.tempoMarkers,
    getMeasureSpans(ppqn, timeMap, durationTicks).length,
  );
}

/**
 * Removes a meter marker. The initial marker cannot be removed. Following
 * markers keep their measure index and their ticks are recomputed.
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

  const anchors = getMeterAnchors(ppqn, timeMap, durationTicks);

  return rebuildMeterStructure(
    ppqn,
    anchors.filter((_, index) => index !== markerIndex),
    timeMap.tempoMarkers,
    getMeasureSpans(ppqn, timeMap, durationTicks).length,
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
    meterMarkers: timeMap.meterMarkers,
    tempoMarkers: normalizeTempoMarkers([
      ...timeMap.tempoMarkers,
      marker,
    ]),
  };
}

export function moveTempoMarker(
  timeMap: TimeMap,
  durationTicks: Tick,
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
    meterMarkers: timeMap.meterMarkers,
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
    meterMarkers: timeMap.meterMarkers,
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
    meterMarkers: timeMap.meterMarkers,
    tempoMarkers: normalizeTempoMarkers(
      timeMap.tempoMarkers.filter(
        (marker) => marker.startTick !== startTick,
      ),
    ),
  };
}

/** Shifts every marker strictly after `insertionTick` by `insertedTicks`.
 * A marker exactly at `insertionTick` stays: it now starts the inserted
 * measure, which inherits its meter. */
export function insertTimeIntoTimeMap(
  timeMap: TimeMap,
  insertionTick: Tick,
  insertedTicks: number,
): TimeMap {
  const shiftMarker = <T extends { readonly startTick: Tick }>(
    marker: T,
  ): T => ({
    ...marker,
    startTick: marker.startTick > insertionTick
      ? marker.startTick + insertedTicks
      : marker.startTick,
  });

  return {
    meterMarkers: timeMap.meterMarkers.map(shiftMarker),
    tempoMarkers: timeMap.tempoMarkers.map(shiftMarker),
  };
}

/**
 * Removes whole measures spanning `[removalStartTick, removalEndTick)`.
 * Meter markers are anchored to measure indices: markers inside the range
 * are dropped (the marker starting the range survives when its segment
 * extends past it), following markers shift left by the removed measure
 * count and every tick is recomputed. Tempo markers stay tick-anchored:
 * markers inside the range are dropped and later markers shift left.
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

  const firstIndex = firstRemoved.index;
  const lastIndex = lastRemoved.index;
  const removedCount = lastIndex - firstIndex + 1;
  const removedTicks = removalEndTick - removalStartTick;
  const anchors = getMeterAnchors(ppqn, timeMap, durationTicks);
  const keptAnchors: MeterAnchor[] = [];

  for (
    let anchorIndex = 0;
    anchorIndex < anchors.length;
    anchorIndex += 1
  ) {
    const anchor = anchors[anchorIndex];

    if (anchor === undefined) {
      continue;
    }

    if (anchor.measureIndex < firstIndex) {
      keptAnchors.push(anchor);
      continue;
    }

    if (anchor.measureIndex > lastIndex) {
      keptAnchors.push({
        ...anchor,
        measureIndex: anchor.measureIndex - removedCount,
      });
      continue;
    }


  }

  if (keptAnchors[0]?.measureIndex !== 0) {
    const activeAnchor = anchors.reduce(
      (selected, anchor) =>
        anchor.measureIndex <= lastIndex + 1 ? anchor : selected,
      anchors[0],
    );

    if (activeAnchor === undefined) {
      throw new RangeError("A clip meter map must start at measure 0.");
    }

    keptAnchors.unshift({
      measureIndex: 0,
      timeSignature: activeAnchor.timeSignature,
    });
  }

  const tempoMarkers = timeMap.tempoMarkers.flatMap((marker) => {
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

  if (tempoMarkers[0]?.startTick !== 0) {
    tempoMarkers.unshift({
      startTick: 0,
      bpm: getTempoAtTick(timeMap, removalEndTick),
    });
  }

  return rebuildMeterStructure(
    ppqn,
    keptAnchors,
    tempoMarkers,
    spans.length - removedCount,
  );
}

function getMarkerAtTick<T extends { readonly startTick: Tick }>(
  markers: readonly T[],
  tick: Tick,
): T {
  let selected = requireMarkerAtZero(markers, "timeline");

  for (const marker of markers) {
    if (marker.startTick > tick) {
      break;
    }

    selected = marker;
  }

  return selected;
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
