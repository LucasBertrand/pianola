import { PROJECT_CONSTANTS } from "../project/project-constants";
import type { Tick } from "../identifiers";
import type {
  ScaleMarker,
  SectionMarker,
  TempoMarker,
  TimeMap,
} from "./time-map-model";
import {
  normalizeScaleMarkers,
  normalizeSectionMarkers,
  normalizeTempoMarkers,
} from "./time-map-normalization";

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
