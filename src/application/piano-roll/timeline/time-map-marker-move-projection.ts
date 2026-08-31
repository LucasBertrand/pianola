import type {
  Tick,
} from "../../../domain/identifiers";
import type {
  TimeMap,
} from "../../../domain/transport/time-map";
import type {
  MovableTimeMapMarkerKind,
  SelectedTimeMapMarkerGroup,
} from "../../../editor-core/selection/editor-selection";
import type {
  TimeMapMarkerCollision,
} from "./marker-collision-resolution";

export interface TimeMapMarkerMoveProjectionInput {
  readonly timeMap: TimeMap;
  readonly durationTicks: Tick;
  readonly movedGroups: readonly SelectedTimeMapMarkerGroup[];
  readonly deltaTicks: Tick;
}

export interface TimeMapMarkerMoveProjection {
  readonly timeMap: TimeMap;
  readonly collisions: readonly TimeMapMarkerCollision[];
}

/**
 * Builds the effective time map for one point-marker move without mutating the
 * published map. Meter markers are structural and deliberately stay in place.
 */
export function projectTimeMapMarkerMove(
  input: TimeMapMarkerMoveProjectionInput,
): TimeMapMarkerMoveProjection {
  const {
    timeMap,
    durationTicks,
    movedGroups,
    deltaTicks,
  } = input;

  if (!Number.isSafeInteger(deltaTicks)) {
    throw new RangeError("A marker preview must use a whole tick offset.");
  }

  const tempo = projectMarkerKind(
    "tempo",
    timeMap.tempoMarkers,
    movedGroups,
    deltaTicks,
    durationTicks,
  );
  const scale = projectMarkerKind(
    "scale",
    timeMap.scaleMarkers,
    movedGroups,
    deltaTicks,
    durationTicks,
  );
  const section = projectMarkerKind(
    "section",
    timeMap.sectionMarkers,
    movedGroups,
    deltaTicks,
    durationTicks,
  );

  if (deltaTicks === 0 || movedGroups.length === 0) {
    return {
      timeMap,
      collisions: [],
    };
  }

  return {
    timeMap: {
      meterMarkers: timeMap.meterMarkers,
      tempoMarkers: tempo.markers,
      scaleMarkers: scale.markers,
      sectionMarkers: section.markers,
    },
    collisions: [
      ...tempo.collisions,
      ...scale.collisions,
      ...section.collisions,
    ],
  };
}

interface MarkerAtTick {
  readonly startTick: Tick;
}

function projectMarkerKind<TMarker extends MarkerAtTick>(
  kind: MovableTimeMapMarkerKind,
  markers: readonly TMarker[],
  groups: readonly SelectedTimeMapMarkerGroup[],
  deltaTicks: Tick,
  durationTicks: Tick,
): {
  readonly markers: readonly TMarker[];
  readonly collisions: readonly TimeMapMarkerCollision[];
} {
  const selectedTicks = new Set<Tick>();

  for (const group of groups) {
    if (group.kinds.includes(kind)) {
      selectedTicks.add(group.startTick);
    }
  }

  if (selectedTicks.size === 0) {
    return { markers, collisions: [] };
  }

  const markersByTick = new Map(
    markers.map((marker) => [marker.startTick, marker] as const),
  );
  const collisions: TimeMapMarkerCollision[] = [];
  const targetTicks = new Set<Tick>();

  for (const sourceTick of selectedTicks) {
    if (!markersByTick.has(sourceTick)) {
      throw new RangeError(
        `The selected ${kind} marker at tick ${String(sourceTick)} no longer exists.`,
      );
    }

    const targetTick = sourceTick + deltaTicks;

    if (targetTick > durationTicks || targetTick < 0) {
      throw new RangeError(
        targetTick > durationTicks
          ? "A marker must be placed within the clip."
          : `The ${kind} marker must remain inside the clip.`,
      );
    }

    targetTicks.add(targetTick);

    if (
      targetTick !== sourceTick
      && markersByTick.has(targetTick)
      && !selectedTicks.has(targetTick)
    ) {
      collisions.push({ kind, targetTick });
    }
  }

  if (deltaTicks === 0) {
    return { markers, collisions: [] };
  }

  const projected = markers
    .filter((marker) =>
      !selectedTicks.has(marker.startTick)
      && !targetTicks.has(marker.startTick))
    .concat(
      markers
        .filter((marker) => selectedTicks.has(marker.startTick))
        .map((marker) => ({
          ...marker,
          startTick: marker.startTick + deltaTicks,
        })),
    )
    .sort((left, right) => left.startTick - right.startTick);

  return {
    markers: projected,
    collisions,
  };
}
