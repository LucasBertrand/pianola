import type {
  Tick,
} from "../../domain/identifiers";
import type {
  TimelineDragPreview,
} from "../../editor/model/timeline-drag-preview";
import type {
  MovableTimeMapMarkerKind,
  SelectedTimeMapMarkerGroup,
} from "../../editor/selection/editor-selection";
import type {
  TimeMapMarkerFlag,
} from "../../use-cases/piano-roll/timeline/time-map-marker-plans";

interface PreviewMarkerGroup extends SelectedTimeMapMarkerGroup {
  readonly movesMeter: boolean;
}

export interface MarkerPreviewProjection {
  readonly deltaTicks: number;
  readonly sourceGroupsByTick: ReadonlyMap<Tick, PreviewMarkerGroup>;
  readonly remainingFlagsByTick: ReadonlyMap<
    Tick,
    TimeMapMarkerFlag | null
  >;
  readonly destinationFlagsByTick: ReadonlyMap<Tick, TimeMapMarkerFlag>;
}

export interface MarkerBoundaryVisibilityInput {
  readonly selected: boolean;
  readonly hovered: boolean;
  readonly originalHidden: boolean;
  readonly sourcePreviewed: boolean;
}

export function isOriginalMarkerBoundaryVisible(
  input: MarkerBoundaryVisibilityInput,
): boolean {
  return !input.originalHidden
    && !input.sourcePreviewed
    && (input.selected || input.hovered);
}

export function createMarkerPreviewProjection(
  flags: readonly TimeMapMarkerFlag[],
  selectedGroups: readonly SelectedTimeMapMarkerGroup[],
  preview: TimelineDragPreview,
): MarkerPreviewProjection {
  const groups = resolvePreviewMarkerGroups(flags, selectedGroups, preview);
  const sourceGroupsByTick = new Map(
    groups.map((group) => [group.startTick, group] as const),
  );
  const flagsByTick = new Map(
    flags.map((flag) => [flag.startTick, flag] as const),
  );
  const remainingFlagsByTick = new Map<
    Tick,
    TimeMapMarkerFlag | null
  >();

  for (const group of groups) {
    const sourceFlag = flagsByTick.get(group.startTick);

    if (sourceFlag === undefined) {
      continue;
    }

    remainingFlagsByTick.set(
      group.startTick,
      removePreviewedMarkerKinds(sourceFlag, group),
    );
  }

  const destinationFlagsByTick = new Map<Tick, TimeMapMarkerFlag>();

  for (const group of groups) {
    const sourceFlag = flagsByTick.get(group.startTick);

    if (sourceFlag === undefined) {
      continue;
    }

    const targetTick = group.startTick + preview.deltaTicks;
    const stationaryTarget = remainingFlagsByTick.has(targetTick)
      ? remainingFlagsByTick.get(targetTick)
        ?? createEmptyMarkerFlag(targetTick)
      : flagsByTick.get(targetTick) ?? createEmptyMarkerFlag(targetTick);
    const targetBase = destinationFlagsByTick.get(targetTick)
      ?? stationaryTarget;

    destinationFlagsByTick.set(
      targetTick,
      addPreviewedMarkerKinds(targetBase, sourceFlag, group),
    );
  }

  return {
    deltaTicks: preview.deltaTicks,
    sourceGroupsByTick,
    remainingFlagsByTick,
    destinationFlagsByTick,
  };
}

function resolvePreviewMarkerGroups(
  flags: readonly TimeMapMarkerFlag[],
  selectedGroups: readonly SelectedTimeMapMarkerGroup[],
  preview: TimelineDragPreview,
): readonly PreviewMarkerGroup[] {
  if (
    preview.source !== "markers"
    || preview.standaloneMarkerTick === null
  ) {
    return selectedGroups.map((group) => ({
      ...group,
      movesMeter: false,
    }));
  }

  const flag = flags.find(
    (candidate) => candidate.startTick === preview.standaloneMarkerTick,
  );

  if (flag === undefined) {
    return [];
  }

  const kinds: MovableTimeMapMarkerKind[] = [];

  if (flag.bpm !== null) {
    kinds.push("tempo");
  }

  if (flag.patternId !== null) {
    kinds.push("scale");
  }

  return [{
    startTick: flag.startTick,
    kinds,
    movesMeter: flag.timeSignature !== null,
  }];
}

function removePreviewedMarkerKinds(
  flag: TimeMapMarkerFlag,
  group: PreviewMarkerGroup,
): TimeMapMarkerFlag | null {
  const nextFlag: TimeMapMarkerFlag = {
    ...flag,
    bpm: group.kinds.includes("tempo") ? null : flag.bpm,
    timeSignature: group.movesMeter ? null : flag.timeSignature,
    rootNote: group.kinds.includes("scale") ? null : flag.rootNote,
    patternType: group.kinds.includes("scale") ? null : flag.patternType,
    patternId: group.kinds.includes("scale") ? null : flag.patternId,
  };

  return nextFlag.bpm === null
    && nextFlag.timeSignature === null
    && nextFlag.patternId === null
      ? null
      : nextFlag;
}

function addPreviewedMarkerKinds(
  target: TimeMapMarkerFlag,
  source: TimeMapMarkerFlag,
  group: PreviewMarkerGroup,
): TimeMapMarkerFlag {
  return {
    ...target,
    bpm: group.kinds.includes("tempo") ? source.bpm : target.bpm,
    timeSignature: group.movesMeter
      ? source.timeSignature
      : target.timeSignature,
    rootNote: group.kinds.includes("scale") ? source.rootNote : target.rootNote,
    patternType: group.kinds.includes("scale")
      ? source.patternType
      : target.patternType,
    patternId: group.kinds.includes("scale")
      ? source.patternId
      : target.patternId,
  };
}

function createEmptyMarkerFlag(startTick: Tick): TimeMapMarkerFlag {
  return {
    startTick,
    bpm: null,
    timeSignature: null,
    rootNote: null,
    patternType: null,
    patternId: null,
    isInitial: false,
  };
}
