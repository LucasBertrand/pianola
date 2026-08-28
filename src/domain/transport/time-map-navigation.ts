import type { Tick } from "../identifiers";
import type {
  MeasurePosition,
  MeasureSpan,
  MeterMarker,
  ScaleMarker,
  TimeMap,
  TimeSignature,
} from "./time-map-model";
import {
  getBeatTicks,
  getTicksPerMeasure,
} from "./time-signature";

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
