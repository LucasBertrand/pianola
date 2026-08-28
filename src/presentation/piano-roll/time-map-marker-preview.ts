import type {
  Tick,
} from "../../domain/identifiers";
import type {
  TimelineDragPreview,
} from "../../editor-core/model/timeline-drag-preview";
import type {
  MovableTimeMapMarkerKind,
  SelectedTimeMapMarkerGroup,
} from "../../editor-core/selection/editor-selection";
import type {
  TimeMapMarkerFlag,
} from "../../application/piano-roll/timeline/time-map-marker-plans";

type PreviewMarkerGroup = SelectedTimeMapMarkerGroup;

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
    return selectedGroups;
  }

  const flag = flags.find(
    (candidate) => candidate.startTick === preview.standaloneMarkerTick,
  );

  if (flag === undefined) {
    return [];
  }

  const kinds: MovableTimeMapMarkerKind[] = [];

  if (flag.startTick > 0 && flag.bpm !== null) {
    kinds.push("tempo");
  }

  if (flag.startTick > 0 && flag.patternId !== null) {
    kinds.push("scale");
  }

  if (flag.sectionComment !== null) {
    kinds.push("section");
  }

  return [{
    startTick: flag.startTick,
    kinds,
  }];
}

function removePreviewedMarkerKinds(
  flag: TimeMapMarkerFlag,
  group: PreviewMarkerGroup,
): TimeMapMarkerFlag | null {
  const nextFlag: TimeMapMarkerFlag = {
    ...flag,
    bpm: group.kinds.includes("tempo") ? null : flag.bpm,
    timeSignature: flag.timeSignature,
    rootNote: group.kinds.includes("scale") ? null : flag.rootNote,
    patternType: group.kinds.includes("scale") ? null : flag.patternType,
    patternId: group.kinds.includes("scale") ? null : flag.patternId,
    sectionComment: group.kinds.includes("section")
      ? null
      : flag.sectionComment,
  };

  return nextFlag.bpm === null
    && nextFlag.timeSignature === null
    && nextFlag.patternId === null
    && nextFlag.sectionComment === null
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
    timeSignature: target.timeSignature,
    rootNote: group.kinds.includes("scale") ? source.rootNote : target.rootNote,
    patternType: group.kinds.includes("scale")
      ? source.patternType
      : target.patternType,
    patternId: group.kinds.includes("scale")
      ? source.patternId
      : target.patternId,
    sectionComment: group.kinds.includes("section")
      ? source.sectionComment
      : target.sectionComment,
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
    sectionComment: null,
    isInitial: false,
  };
}
