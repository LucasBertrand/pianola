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
  type ProjectState,
} from "../../../domain/project/project-document";
import type {
  MovableTimeMapMarkerKind,
  SelectedTimeMapMarkerGroup,
} from "../../../editor/selection/editor-selection";
import type {
  TimeMapMarkerCollision,
} from "../timeline/marker-collision-resolution";

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
  state: ProjectState,
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

  const tempoCollisions = validateKindMove(
    "tempo",
    timeMap.tempoMarkers.map((marker) => marker.startTick),
    selectedTicksByKind.tempo,
    deltaTicks,
    durationTicks,
  );
  const scaleCollisions = validateKindMove(
    "scale",
    timeMap.scaleMarkers.map((marker) => marker.startTick),
    selectedTicksByKind.scale,
    deltaTicks,
    durationTicks,
  );
  const sectionCollisions = validateKindMove(
    "section",
    timeMap.sectionMarkers.map((marker) => marker.startTick),
    selectedTicksByKind.section,
    deltaTicks,
    durationTicks,
  );
  const collisions = [
    ...tempoCollisions,
    ...scaleCollisions,
    ...sectionCollisions,
  ];

  if (collisions.length > 0 && !overwriteCollisions) {
    return {
      commands: [],
      resultingMarkerGroups: groups.map((group) => ({
        startTick: group.startTick + deltaTicks,
        kinds: group.kinds.slice(),
      })),
      collisions,
    };
  }

  const commands: PianoRollCommand[] = [];

  for (const collision of collisions) {
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
    commands.push({
      type: "MoveTempoMarker",
      clipId,
      startTick,
      targetTick: startTick + deltaTicks,
    });
  }

  for (const startTick of orderSourcesForMove(
    selectedTicksByKind.scale,
    deltaTicks,
  )) {
    commands.push({
      type: "MoveScaleMarker",
      clipId,
      startTick,
      targetTick: startTick + deltaTicks,
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
    resultingMarkerGroups: groups.map((group) => ({
      startTick: group.startTick + deltaTicks,
      kinds: group.kinds.slice(),
    })),
    collisions,
  };
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
    // Point markers must remain strictly inside the clip duration.
    maximumEndTick = Math.max(maximumEndTick, group.startTick + 1);
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
  const bounds = measureTimelineSelectionTickBounds(notes, markerGroups);

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

function validateKindMove(
  label: MovableTimeMapMarkerKind,
  existingTicks: readonly Tick[],
  selectedTicks: readonly Tick[],
  deltaTicks: Tick,
  durationTicks: Tick,
): TimeMapMarkerCollision[] {
  const selected = new Set(selectedTicks);
  const existing = new Set(existingTicks);
  const collisions: TimeMapMarkerCollision[] = [];

  for (const startTick of selectedTicks) {
    if (!existing.has(startTick)) {
      throw new TimelineSelectionMoveError(
        `The selected ${label} marker no longer exists.`,
      );
    }

    const targetTick = startTick + deltaTicks;

    if (targetTick <= 0 || targetTick >= durationTicks) {
      throw new TimelineSelectionMoveError(
        `The ${label} marker must remain inside the clip after tick 0.`,
      );
    }

    if (existing.has(targetTick) && !selected.has(targetTick)) {
      collisions.push({ kind: label, targetTick });
    }
  }

  return collisions;
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
