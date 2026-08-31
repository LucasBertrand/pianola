import type {
  PianoRollCommand,
} from "../../../domain/commands/command-types";
import type {
  ClipId,
  Tick,
} from "../../../domain/identifiers";
import type {
  Note,
} from "../../../domain/notes/note";
import {
  getClip,
  type EditorSessionState,
} from "../../../domain/project/project-document";
import type {
  MovableTimeMapMarkerKind,
  SelectedTimeMapMarkerGroup,
} from "../../../editor-core/selection/editor-selection";
import type {
  TimeMapMarkerCollision,
} from "../timeline/marker-collision-resolution";
import {
  projectTimeMapMarkerMove,
} from "../timeline/time-map-marker-move-projection";

export interface SelectedMarkerMovePlan {
  readonly commands: readonly PianoRollCommand[];
  readonly resultingMarkerGroups: readonly SelectedTimeMapMarkerGroup[];
  readonly collisions: readonly TimeMapMarkerCollision[];
}

export interface TimelineSelectionTickBounds {
  readonly minimumStartTick: Tick;
  readonly maximumEndTick: Tick;
}

export class TimelineSelectionMoveError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TimelineSelectionMoveError";
  }
}

/**
 * Plans simultaneous tempo/scale/section moves. Meter markers are deliberately not
 * represented by SelectedTimeMapMarkerGroup and therefore remain untouched.
 */
export function planSelectedMarkerMove(
  state: EditorSessionState,
  clipId: ClipId,
  groups: readonly SelectedTimeMapMarkerGroup[],
  deltaTicks: Tick,
  overwriteCollisions = false,
): SelectedMarkerMovePlan {
  if (!Number.isSafeInteger(deltaTicks)) {
    throw new TimelineSelectionMoveError(
      "The marker move must use a whole tick offset.",
    );
  }

  if (deltaTicks === 0 || groups.length === 0) {
    return {
      commands: [],
      resultingMarkerGroups: cloneGroups(groups),
      collisions: [],
    };
  }

  const clip = getClip(state, clipId);
  const { timeMap, durationTicks } = clip.timeline;
  const selectedTicksByKind = {
    tempo: collectSelectedTicks(groups, "tempo"),
    scale: collectSelectedTicks(groups, "scale"),
    section: collectSelectedTicks(groups, "section"),
  };

  let collisions: readonly TimeMapMarkerCollision[];

  try {
    collisions = projectTimeMapMarkerMove({
      timeMap,
      durationTicks,
      movedGroups: groups,
      deltaTicks,
    }).collisions;
  } catch (error: unknown) {
    throw new TimelineSelectionMoveError(
      error instanceof Error
        ? error.message
        : "The selected markers cannot be moved.",
    );
  }

  if (collisions.length > 0 && !overwriteCollisions) {
    return {
      commands: [],
      resultingMarkerGroups: moveMarkerGroups(groups, deltaTicks),
      collisions,
    };
  }

  const commands: PianoRollCommand[] = [];

  for (const collision of collisions) {
    if (
      collision.targetTick === 0
      && (collision.kind === "tempo" || collision.kind === "scale")
    ) {
      continue;
    }

    commands.push({
      type: collision.kind === "tempo"
        ? "DeleteTempoMarker"
        : collision.kind === "scale"
          ? "DeleteScaleMarker"
          : "DeleteSectionMarker",
      clipId,
      startTick: collision.targetTick,
    });
  }

  for (const startTick of orderSourcesForMove(
    selectedTicksByKind.tempo,
    deltaTicks,
  )) {
    const targetTick = startTick + deltaTicks;

    if (targetTick === 0) {
      const source = timeMap.tempoMarkers.find(
        (marker) => marker.startTick === startTick,
      );

      if (source === undefined) {
        throw new TimelineSelectionMoveError(
          `The selected tempo marker at tick ${String(startTick)} no longer exists.`,
        );
      }

      commands.push(
        {
          type: "UpdateTempoMarker",
          clipId,
          startTick: 0,
          bpm: source.bpm,
        },
        { type: "DeleteTempoMarker", clipId, startTick },
      );
      continue;
    }

    commands.push({
      type: "MoveTempoMarker",
      clipId,
      startTick,
      targetTick,
    });
  }

  for (const startTick of orderSourcesForMove(
    selectedTicksByKind.scale,
    deltaTicks,
  )) {
    const targetTick = startTick + deltaTicks;

    if (targetTick === 0) {
      const source = timeMap.scaleMarkers.find(
        (marker) => marker.startTick === startTick,
      );

      if (source === undefined) {
        throw new TimelineSelectionMoveError(
          `The selected scale marker at tick ${String(startTick)} no longer exists.`,
        );
      }

      commands.push(
        {
          type: "UpdateScaleMarker",
          clipId,
          startTick: 0,
          changes: {
            rootNote: source.rootNote,
            patternType: source.patternType,
            patternId: source.patternId,
          },
        },
        { type: "DeleteScaleMarker", clipId, startTick },
      );
      continue;
    }

    commands.push({
      type: "MoveScaleMarker",
      clipId,
      startTick,
      targetTick,
    });
  }

  for (const startTick of orderSourcesForMove(
    selectedTicksByKind.section,
    deltaTicks,
  )) {
    commands.push({
      type: "MoveSectionMarker",
      clipId,
      startTick,
      targetTick: startTick + deltaTicks,
    });
  }

  return {
    commands,
    resultingMarkerGroups: moveMarkerGroups(groups, deltaTicks),
    collisions,
  };
}

function moveMarkerGroups(
  groups: readonly SelectedTimeMapMarkerGroup[],
  deltaTicks: Tick,
): SelectedTimeMapMarkerGroup[] {
  return groups.flatMap((group) => {
    const startTick = group.startTick + deltaTicks;
    const kinds = startTick === 0
      ? group.kinds.filter((kind) => kind === "section")
      : group.kinds.slice();

    return kinds.length === 0 ? [] : [{ startTick, kinds }];
  });
}

/** Bounds shared by note-initiated and marker-initiated horizontal drags. */
export function measureTimelineSelectionTickBounds(
  notes: readonly Note[],
  markerGroups: readonly SelectedTimeMapMarkerGroup[],
): TimelineSelectionTickBounds | null {
  let minimumStartTick = Number.POSITIVE_INFINITY;
  let maximumEndTick = Number.NEGATIVE_INFINITY;

  for (const note of notes) {
    minimumStartTick = Math.min(minimumStartTick, note.startTick);
    maximumEndTick = Math.max(
      maximumEndTick,
      note.startTick + note.durationTicks,
    );
  }

  for (const group of markerGroups) {
    minimumStartTick = Math.min(minimumStartTick, group.startTick);
    maximumEndTick = Math.max(
      maximumEndTick,
      group.startTick,
    );
  }

  return Number.isFinite(minimumStartTick)
    ? { minimumStartTick, maximumEndTick }
    : null;
}

export function clampTimelineSelectionDelta(
  notes: readonly Note[],
  markerGroups: readonly SelectedTimeMapMarkerGroup[],
  requestedDeltaTicks: Tick,
  durationTicks: Tick,
): Tick {
  const bounds = measureTimelineSelectionTickBounds(
    notes,
    markerGroups,
  );

  if (bounds === null) {
    return 0;
  }

  return Math.min(
    durationTicks - bounds.maximumEndTick,
    Math.max(-bounds.minimumStartTick, requestedDeltaTicks),
  );
}

function collectSelectedTicks(
  groups: readonly SelectedTimeMapMarkerGroup[],
  kind: MovableTimeMapMarkerKind,
): Tick[] {
  return groups
    .filter((group) => group.kinds.includes(kind))
    .map((group) => group.startTick);
}

function orderSourcesForMove(
  ticks: readonly Tick[],
  deltaTicks: Tick,
): Tick[] {
  return ticks.slice().sort(
    deltaTicks > 0
      ? (left, right) => right - left
      : (left, right) => left - right,
  );
}

function cloneGroups(
  groups: readonly SelectedTimeMapMarkerGroup[],
): SelectedTimeMapMarkerGroup[] {
  return groups.map((group) => ({
    startTick: group.startTick,
    kinds: group.kinds.slice(),
  }));
}
