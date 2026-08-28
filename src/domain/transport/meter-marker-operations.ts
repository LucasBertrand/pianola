import type { Tick } from "../identifiers";
import type {
  MeterMarker,
  ScaleMarker,
  SectionMarker,
  TempoMarker,
  TimeMap,
  TimeSignature,
} from "./time-map-model";
import { getMeasureSpans } from "./time-map-navigation";
import { getTicksPerMeasure } from "./time-signature";
import { normalizeMeterMarkers } from "./time-map-normalization";

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
