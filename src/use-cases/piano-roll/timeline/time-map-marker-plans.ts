import {
  PROJECT_CONSTANTS,
} from "../../../config/domain-limits";
import type {
  PianoRollCommand,
} from "../../../domain/commands/command-types";
import type {
  ClipId,
  Tick,
} from "../../../domain/identifiers";
import {
  getClip,
  type ProjectState,
} from "../../../domain/project/project-document";
import {
  getMeasureSpanAtTick,
  getMeterAtTick,
  getTempoAtTick,
  getScaleMarkerAtTick,
  moveMeterMarker,
  isMeasureBoundary,
  type TimeMap,
  type TimeSignature,
} from "../../../domain/transport/time-map";
import type { TonalPatternId, TonalPatternType } from "../../../music/pitch-snap";
import { ChordType } from "@tonaljs/tonal";
import type {
  TimeMapMarkerCollision,
} from "./marker-collision-resolution";


/**
 * One ruler flag: the union of meter and tempo marker ticks. A flag may
 * carry both values, or only one of them.
 */
export interface TimeMapMarkerFlag {
  readonly startTick: Tick;
  readonly bpm: number | null;
  readonly timeSignature: TimeSignature | null;
  readonly rootNote: string | null;
  readonly patternType: TonalPatternType | null;
  readonly patternId: string | null;
  readonly isInitial: boolean;
}

/** Transient dialog draft; never enters the document until confirmation. */
export interface TimeMapMarkerDraft {
  readonly mode: "create" | "edit";
  readonly startTick: Tick;
  readonly measureIndex: number | null;
  readonly tempoIncluded: boolean;
  readonly meterIncluded: boolean;
  readonly scaleIncluded: boolean;
  readonly canChangeMarkerTypes: boolean;
  readonly bpm: number;
  readonly timeSignature: TimeSignature | null;
  readonly rootNote: string;
  readonly patternType: TonalPatternType;
  readonly patternId: TonalPatternId;
  readonly canDelete: boolean;
}

/** Groups meter and tempo markers by tick, sorted by position. */
export function createTimeMapMarkerFlags(
  timeMap: TimeMap,
): TimeMapMarkerFlag[] {
  const ticks = [...new Set([
    ...timeMap.meterMarkers.map((marker) => marker.startTick),
    ...timeMap.tempoMarkers.map((marker) => marker.startTick),
    ...timeMap.scaleMarkers.map((marker) => marker.startTick),
  ])].sort((left, right) => left - right);

  return ticks.map((startTick) => {
    const scaleMarker = timeMap.scaleMarkers.find(m => m.startTick === startTick);
    return {
      startTick,
      bpm: timeMap.tempoMarkers.find(
        (marker) => marker.startTick === startTick,
      )?.bpm ?? null,
      timeSignature: timeMap.meterMarkers.find(
        (marker) => marker.startTick === startTick,
      )?.timeSignature ?? null,
      rootNote: scaleMarker?.rootNote ?? null,
      patternType: scaleMarker?.patternType ?? null,
      patternId: scaleMarker?.patternId ?? null,
      isInitial: startTick === 0,
    };
  });
}

/**
 * Resolves any ruler tick to the boundary of its measure and builds the
 * dialog draft. Edit mode when a marker already exists at that boundary;
 * values default to the active tempo and meter.
 */
export function createMarkerDraft(
  state: ProjectState,
  clipId: ClipId,
  tick: Tick,
): TimeMapMarkerDraft {
  const clip = getClip(state, clipId);
  const { timeMap, durationTicks } = clip.timeline;
  const isBoundary = tick === 0 || isMeasureBoundary(
    state.clock.ppqn,
    timeMap,
    durationTicks,
    tick,
  );

  if (isBoundary) {
    const span = getMeasureSpanAtTick(
      state.clock.ppqn,
      timeMap,
      durationTicks,
      tick,
    );
    const meterMarker = timeMap.meterMarkers.find(
      (marker) => marker.startTick === span.startTick,
    );
    const tempoMarker = timeMap.tempoMarkers.find(
      (marker) => marker.startTick === span.startTick,
    );
    const scaleMarker = timeMap.scaleMarkers.find(
      (marker) => marker.startTick === span.startTick,
    );
    const hasMarker = meterMarker !== undefined || tempoMarker !== undefined || scaleMarker !== undefined;

    const activeScaleMarker = getScaleMarkerAtTick(timeMap, span.startTick);

    return {
      mode: hasMarker ? "edit" : "create",
      startTick: span.startTick,
      measureIndex: span.index,
      tempoIncluded: tempoMarker !== undefined,
      meterIncluded: meterMarker !== undefined,
      scaleIncluded: scaleMarker !== undefined,
      canChangeMarkerTypes: span.startTick > 0,
      bpm: tempoMarker?.bpm ?? getTempoAtTick(timeMap, span.startTick),
      timeSignature: meterMarker?.timeSignature
        ?? getMeterAtTick(timeMap, span.startTick),
      rootNote: scaleMarker?.rootNote ?? activeScaleMarker.rootNote,
      patternType: scaleMarker?.patternType ?? activeScaleMarker.patternType,
      patternId: scaleMarker?.patternId ?? activeScaleMarker.patternId,
      canDelete: hasMarker && span.startTick > 0,
    };
  }

  const tempoMarker = timeMap.tempoMarkers.find(
    (marker) => marker.startTick === tick,
  );
  const scaleMarker = timeMap.scaleMarkers.find(
    (marker) => marker.startTick === tick,
  );
  const hasMarker = tempoMarker !== undefined || scaleMarker !== undefined;
  const activeScaleMarker = getScaleMarkerAtTick(timeMap, tick);

  return {
    mode: hasMarker ? "edit" : "create",
    startTick: tick,
    measureIndex: null,
    tempoIncluded: tempoMarker !== undefined,
    meterIncluded: false,
    scaleIncluded: scaleMarker !== undefined,
    canChangeMarkerTypes: tick > 0,
    bpm: tempoMarker?.bpm ?? getTempoAtTick(timeMap, tick),
    timeSignature: null,
    rootNote: scaleMarker?.rootNote ?? activeScaleMarker.rootNote,
    patternType: scaleMarker?.patternType ?? activeScaleMarker.patternType,
    patternId: scaleMarker?.patternId ?? activeScaleMarker.patternId,
    canDelete: hasMarker && tick > 0,
  };
}

/**
 * Reconciles the explicit marker types selected in a dialog draft with the
 * stored flag. Unselected existing components are deleted, selected missing
 * components are created, and retained components are updated as needed.
 */
export function planMarkerDraftCommands(
  state: ProjectState,
  clipId: ClipId,
  draft: TimeMapMarkerDraft,
): PianoRollCommand[] {
  const clip = getClip(state, clipId);
  const { timeMap } = clip.timeline;
  const bpm = normalizeDraftBpm(draft.bpm);
  const commands: PianoRollCommand[] = [];

  if (
    draft.startTick === 0
    && (!draft.tempoIncluded
      || !draft.meterIncluded
      || !draft.scaleIncluded)
  ) {
    throw new Error(
      "The initial tempo, meter, and scale markers are required.",
    );
  }

  if (draft.meterIncluded) {
    if (draft.timeSignature === null) {
      throw new Error(
        "A meter marker can only be added on a measure boundary.",
      );
    }

    const timeSignature = normalizeDraftTimeSignature(draft.timeSignature);
    const meterMarker = timeMap.meterMarkers.find(
      (marker) => marker.startTick === draft.startTick,
    );

    if (meterMarker !== undefined) {
      if (!isSameMeter(meterMarker.timeSignature, timeSignature)) {
        commands.push({
          type: "UpdateMeterMarker",
          clipId,
          startTick: draft.startTick,
          timeSignature,
        });
      }
    } else {
      commands.push({
        type: "AddMeterMarker",
        clipId,
        startTick: draft.startTick,
        timeSignature,
      });
    }
  } else if (
    draft.startTick > 0
    && timeMap.meterMarkers.some(
      (marker) => marker.startTick === draft.startTick,
    )
  ) {
    commands.push({
      type: "DeleteMeterMarker",
      clipId,
      startTick: draft.startTick,
    });
  }

  const tempoMarker = timeMap.tempoMarkers.find(
    (marker) => marker.startTick === draft.startTick,
  );

  if (draft.tempoIncluded && tempoMarker !== undefined) {
    if (tempoMarker.bpm !== bpm) {
      commands.push({
        type: "UpdateTempoMarker",
        clipId,
        startTick: draft.startTick,
        bpm,
      });
    }
  } else if (draft.tempoIncluded) {
    commands.push({
      type: "AddTempoMarker",
      clipId,
      startTick: draft.startTick,
      bpm,
    });
  } else if (tempoMarker !== undefined && draft.startTick > 0) {
    commands.push({
      type: "DeleteTempoMarker",
      clipId,
      startTick: draft.startTick,
    });
  }

  const scaleMarker = timeMap.scaleMarkers.find(
    (marker) => marker.startTick === draft.startTick,
  );

  if (draft.scaleIncluded && scaleMarker !== undefined) {
    if (
      scaleMarker.rootNote !== draft.rootNote ||
      scaleMarker.patternType !== draft.patternType ||
      scaleMarker.patternId !== draft.patternId
    ) {
      commands.push({
        type: "UpdateScaleMarker",
        clipId,
        startTick: draft.startTick,
        changes: {
          rootNote: draft.rootNote,
          patternType: draft.patternType,
          patternId: draft.patternId,
        },
      });
    }
  } else if (draft.scaleIncluded) {
    commands.push({
      type: "AddScaleMarker",
      clipId,
      marker: {
        startTick: draft.startTick,
        rootNote: draft.rootNote,
        patternType: draft.patternType,
        patternId: draft.patternId,
      },
    });
  } else if (scaleMarker !== undefined && draft.startTick > 0) {
    commands.push({
      type: "DeleteScaleMarker",
      clipId,
      startTick: draft.startTick,
    });
  }

  return commands;
}

/** Deletes every marker at a tick; the tick-0 markers cannot be deleted. */
export function planMarkerDeletionCommands(
  state: ProjectState,
  clipId: ClipId,
  startTick: Tick,
): PianoRollCommand[] {
  if (startTick <= 0) {
    return [];
  }

  const clip = getClip(state, clipId);
  const { timeMap } = clip.timeline;
  const commands: PianoRollCommand[] = [];

  if (
    timeMap.meterMarkers.some((marker) => marker.startTick === startTick)
  ) {
    commands.push({ type: "DeleteMeterMarker", clipId, startTick });
  }

  if (
    timeMap.tempoMarkers.some((marker) => marker.startTick === startTick)
  ) {
    commands.push({ type: "DeleteTempoMarker", clipId, startTick });
  }

  if (
    timeMap.scaleMarkers.some((marker) => marker.startTick === startTick)
  ) {
    commands.push({ type: "DeleteScaleMarker", clipId, startTick });
  }

  return commands;
}

export interface MarkerMovePlan {
  readonly commands: readonly PianoRollCommand[];
  readonly collisions: readonly TimeMapMarkerCollision[];
}

/** Plans a complete flag move and optionally removes occupied point markers. */
export function planMarkerMove(
  state: ProjectState,
  clipId: ClipId,
  fromTick: Tick,
  toTick: Tick,
  overwriteCollisions = false,
): MarkerMovePlan {
  if (fromTick === toTick) {
    return { commands: [], collisions: [] };
  }

  const clip = getClip(state, clipId);
  const { timeMap, durationTicks } = clip.timeline;
  const moveCommands: PianoRollCommand[] = [];

  const hasMeter = timeMap.meterMarkers.some((marker) => marker.startTick === fromTick);
  let groupTargetTick = toTick;

  if (hasMeter) {
    const targetHasMeter = timeMap.meterMarkers.some((marker) => marker.startTick === toTick);
    if (targetHasMeter) {
      throw new Error("A meter marker already exists at this position.");
    }

    try {
      const edit = moveMeterMarker(
        state.clock.ppqn,
        timeMap,
        durationTicks,
        fromTick,
        toTick,
      );
      groupTargetTick = edit.movedMarkerTick;
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "The meter marker cannot be moved.",
      );
    }

    moveCommands.push({
      type: "MoveMeterMarker",
      clipId,
      startTick: fromTick,
      targetTick: toTick,
    });
  }

  const isMovingTempo = timeMap.tempoMarkers.some((marker) => marker.startTick === fromTick);
  const targetHasTempo = timeMap.tempoMarkers.some((marker) => marker.startTick === groupTargetTick);
  const collisions: TimeMapMarkerCollision[] = [];

  if (isMovingTempo) {
    if (targetHasTempo && fromTick !== groupTargetTick) {
      collisions.push({ kind: "tempo", targetTick: groupTargetTick });
    }

    if (fromTick !== groupTargetTick) {
      moveCommands.push({
        type: "MoveTempoMarker",
        clipId,
        startTick: fromTick,
        targetTick: groupTargetTick,
      });
    }
  }

  const isMovingScale = timeMap.scaleMarkers.some((marker) => marker.startTick === fromTick);
  const targetHasScale = timeMap.scaleMarkers.some((marker) => marker.startTick === groupTargetTick);

  if (isMovingScale) {
    if (targetHasScale && fromTick !== groupTargetTick) {
      collisions.push({ kind: "scale", targetTick: groupTargetTick });
    }

    if (fromTick !== groupTargetTick) {
      moveCommands.push({
        type: "MoveScaleMarker",
        clipId,
        startTick: fromTick,
        targetTick: groupTargetTick,
      });
    }
  }

  if (collisions.length > 0 && !overwriteCollisions) {
    return { commands: [], collisions };
  }

  const deleteCommands: PianoRollCommand[] = collisions.map((collision) => ({
    type: collision.kind === "tempo"
      ? "DeleteTempoMarker"
      : "DeleteScaleMarker",
    clipId,
    startTick: collision.targetTick,
  }));

  return {
    commands: [...deleteCommands, ...moveCommands],
    collisions,
  };
}

/** Compatibility planner for callers that require a collision-free move. */
export function planMarkerMoveCommands(
  state: ProjectState,
  clipId: ClipId,
  fromTick: Tick,
  toTick: Tick,
): PianoRollCommand[] {
  const plan = planMarkerMove(state, clipId, fromTick, toTick);
  const collision = plan.collisions[0];

  if (collision !== undefined) {
    throw new Error(
      `A ${collision.kind} marker already exists at this position.`,
    );
  }

  return plan.commands.slice();
}

/** Clamps and rounds a draft tempo to the editor limits and step. */
export function normalizeDraftBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) {
    return PROJECT_CONSTANTS.defaultTempoBpm;
  }

  const stepped = Math.round(bpm / PROJECT_CONSTANTS.tempoStepBpm)
    * PROJECT_CONSTANTS.tempoStepBpm;

  return Number(
    Math.min(
      PROJECT_CONSTANTS.maximumTempoBpm,
      Math.max(PROJECT_CONSTANTS.minimumTempoBpm, stepped),
    ).toFixed(6),
  );
}

const SUPPORTED_DENOMINATORS = new Set([1, 2, 4, 8, 16, 32]);

/**
 * Normalizes a draft time signature: numerator clamped to the supported
 * range, denominator clamped to the nearest power of two. Beat groups that
 * no longer sum to the numerator are dropped (the default grouping applies).
 */
export function normalizeDraftTimeSignature(
  timeSignature: TimeSignature,
): TimeSignature {
  const numerator = Math.min(
    PROJECT_CONSTANTS.maximumTimeSignatureNumerator,
    Math.max(
      PROJECT_CONSTANTS.minimumTimeSignatureNumerator,
      Number.isSafeInteger(timeSignature.numerator)
        ? timeSignature.numerator
        : PROJECT_CONSTANTS.defaultTimeSignatureNumerator,
    ),
  );
  const denominator = SUPPORTED_DENOMINATORS.has(
    timeSignature.denominator,
  )
    ? timeSignature.denominator
    : PROJECT_CONSTANTS.defaultTimeSignatureDenominator;
  const normalized: TimeSignature = { numerator, denominator };
  const beatGroups = timeSignature.beatGroups;

  if (beatGroups === undefined) {
    return normalized;
  }

  let total = 0;

  for (const group of beatGroups) {
    if (!Number.isSafeInteger(group) || group <= 0) {
      return normalized;
    }

    total += group;
  }

  return total === numerator
    ? { ...normalized, beatGroups }
    : normalized;
}

/** Short flag label: "120 · 4/4", "90" or "7/8". */
export function formatMarkerFlagLabel(flag: TimeMapMarkerFlag): string {
  const parts: string[] = [];

  if (flag.bpm !== null) {
    parts.push(formatBpm(flag.bpm));
  }

  if (flag.timeSignature !== null) {
    parts.push(
      `${String(flag.timeSignature.numerator)}/${String(flag.timeSignature.denominator)}`,
    );
  }

  if (flag.patternId !== null && flag.rootNote !== null) {
    if (flag.rootNote === "none") {
      parts.push("Chromatic");
    } else {
      const rootLabel = flag.rootNote;
      let scaleLabel = "";
      if (flag.patternType === "chord") {
        const chord = ChordType.get(flag.patternId);
        const symbol = chord.aliases[0] ?? flag.patternId;
        scaleLabel = `${rootLabel}${symbol}`;
      } else {
        scaleLabel = `${rootLabel} ${flag.patternId}`;
      }

      parts.push(scaleLabel);
    }
  }

  return parts.join(" · ");
}

function isSameMeter(
  first: TimeSignature,
  second: TimeSignature,
): boolean {
  return first.numerator === second.numerator
    && first.denominator === second.denominator;
}

function formatBpm(bpm: number): string {
  if (Number.isInteger(bpm)) {
    return String(bpm);
  }

  return bpm.toFixed(1);
}


