import type { Tick } from "../identifiers";
import type { MeterMarker, TimeMap } from "./time-map-model";
import type { MeterMarkerEdit } from "./meter-marker-operations";
import {
  getMeasureSpans,
  getMeterAtTick,
  getScaleMarkerAtTick,
  getTempoAtTick,
} from "./time-map-navigation";
import {
  normalizeMeterMarkers,
  normalizeScaleMarkers,
  normalizeSectionMarkers,
  normalizeTempoMarkers,
} from "./time-map-normalization";
import { areTimeSignaturesEqual } from "./time-signature";

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
