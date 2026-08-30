import {
  PROJECT_CONSTANTS,
} from "../../../domain/project/project-constants";
import type {
  PianoRollCommand,
} from "../../../domain/commands/command-types";
import type {
  ClipId,
  Tick,
} from "../../../domain/identifiers";
import {
  getClip,
  type EditorSessionState,
} from "../../../domain/project/project-document";
import {
  getMeasureSpanAtTick,
  getMeterAtTick,
  getTempoAtTick,
  getScaleMarkerAtTick,
  isMeasureBoundary,
  type TimeMap,
  type TimeSignature,
} from "../../../domain/transport/time-map";
import type { PitchPatternId, PitchPatternType } from "../../../domain/music-theory/pitch-snap";
import {
  formatMusicTheoryChordSymbol,
} from "../../../domain/music-theory/pitch-pattern-catalog";
import {
  formatPitchClass,
} from "../../../domain/music-theory/pitch-spelling";
import type {
  TimeMapMarkerCollision,
} from "./marker-collision-resolution";


/**
 * One ruler flag: the union of all marker ticks. A flag may carry any
 * combination of meter, tempo, scale, and section values.
 */
export interface TimeMapMarkerFlag {
  readonly startTick: Tick;
  readonly bpm: number | null;
  readonly timeSignature: TimeSignature | null;
  readonly rootNote: string | null;
  readonly patternType: PitchPatternType | null;
  readonly patternId: string | null;
  readonly sectionComment: string | null;
  readonly isInitial: boolean;
}

/** True when a ruler flag contains a meter and no movable point marker. */
export function isIsolatedMeterMarkerFlag(
  flag: TimeMapMarkerFlag,
): boolean {
  return flag.timeSignature !== null
    && flag.bpm === null
    && flag.patternId === null
    && flag.sectionComment === null;
}

/** Transient dialog draft; never enters the document until confirmation. */
export interface TimeMapMarkerDraft {
  readonly mode: "create" | "edit";
  readonly startTick: Tick;
  readonly measureIndex: number | null;
  readonly tempoIncluded: boolean;
  readonly meterIncluded: boolean;
  readonly scaleIncluded: boolean;
  readonly sectionIncluded: boolean;
  readonly canChangeMarkerTypes: boolean;
  readonly bpm: number;
  readonly timeSignature: TimeSignature | null;
  readonly rootNote: string;
  readonly patternType: PitchPatternType;
  readonly patternId: PitchPatternId;
  readonly sectionComment: string;
  readonly canDelete: boolean;
}

/** Groups every marker kind by tick, sorted by position. */
export function createTimeMapMarkerFlags(
  timeMap: TimeMap,
): TimeMapMarkerFlag[] {
  const ticks = [...new Set([
    ...timeMap.meterMarkers.map((marker) => marker.startTick),
    ...timeMap.tempoMarkers.map((marker) => marker.startTick),
    ...timeMap.scaleMarkers.map((marker) => marker.startTick),
    ...timeMap.sectionMarkers.map((marker) => marker.startTick),
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
      sectionComment: timeMap.sectionMarkers.find(
        (marker) => marker.startTick === startTick,
      )?.comment ?? null,
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
  state: EditorSessionState,
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
    const sectionMarker = timeMap.sectionMarkers.find(
      (marker) => marker.startTick === span.startTick,
    );
    const hasMarker = meterMarker !== undefined
      || tempoMarker !== undefined
      || scaleMarker !== undefined
      || sectionMarker !== undefined;

    const activeScaleMarker = getScaleMarkerAtTick(timeMap, span.startTick);

    return {
      mode: hasMarker ? "edit" : "create",
      startTick: span.startTick,
      measureIndex: span.index,
      tempoIncluded: tempoMarker !== undefined,
      meterIncluded: meterMarker !== undefined,
      scaleIncluded: scaleMarker !== undefined,
      sectionIncluded: sectionMarker !== undefined,
      canChangeMarkerTypes: span.startTick > 0,
      bpm: tempoMarker?.bpm ?? getTempoAtTick(timeMap, span.startTick),
      timeSignature: meterMarker?.timeSignature
        ?? getMeterAtTick(timeMap, span.startTick),
      rootNote: scaleMarker?.rootNote ?? activeScaleMarker.rootNote,
      patternType: scaleMarker?.patternType ?? activeScaleMarker.patternType,
      patternId: scaleMarker?.patternId ?? activeScaleMarker.patternId,
      sectionComment: sectionMarker?.comment ?? "",
      canDelete: hasMarker && span.startTick > 0,
    };
  }

  const tempoMarker = timeMap.tempoMarkers.find(
    (marker) => marker.startTick === tick,
  );
  const scaleMarker = timeMap.scaleMarkers.find(
    (marker) => marker.startTick === tick,
  );
  const sectionMarker = timeMap.sectionMarkers.find(
    (marker) => marker.startTick === tick,
  );
  const hasMarker = tempoMarker !== undefined
    || scaleMarker !== undefined
    || sectionMarker !== undefined;
  const activeScaleMarker = getScaleMarkerAtTick(timeMap, tick);

  return {
    mode: hasMarker ? "edit" : "create",
    startTick: tick,
    measureIndex: null,
    tempoIncluded: tempoMarker !== undefined,
    meterIncluded: false,
    scaleIncluded: scaleMarker !== undefined,
    sectionIncluded: sectionMarker !== undefined,
    canChangeMarkerTypes: tick > 0,
    bpm: tempoMarker?.bpm ?? getTempoAtTick(timeMap, tick),
    timeSignature: null,
    rootNote: scaleMarker?.rootNote ?? activeScaleMarker.rootNote,
    patternType: scaleMarker?.patternType ?? activeScaleMarker.patternType,
    patternId: scaleMarker?.patternId ?? activeScaleMarker.patternId,
    sectionComment: sectionMarker?.comment ?? "",
    canDelete: hasMarker && tick > 0,
  };
}

/**
 * Reconciles the explicit marker types selected in a dialog draft with the
 * stored flag. Unselected existing components are deleted, selected missing
 * components are created, and retained components are updated as needed.
 */
export function planMarkerDraftCommands(
  state: EditorSessionState,
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

  const sectionMarker = timeMap.sectionMarkers.find(
    (marker) => marker.startTick === draft.startTick,
  );
  const sectionComment = draft.sectionComment.trim();

  if (draft.sectionIncluded && sectionComment.length === 0) {
    throw new Error("A section marker comment cannot be empty.");
  }

  if (draft.sectionIncluded && sectionMarker !== undefined) {
    if (sectionMarker.comment !== sectionComment) {
      commands.push({
        type: "UpdateSectionMarker",
        clipId,
        startTick: draft.startTick,
        comment: sectionComment,
      });
    }
  } else if (draft.sectionIncluded) {
    commands.push({
      type: "AddSectionMarker",
      clipId,
      startTick: draft.startTick,
      comment: sectionComment,
    });
  } else if (sectionMarker !== undefined) {
    commands.push({
      type: "DeleteSectionMarker",
      clipId,
      startTick: draft.startTick,
    });
  }

  return commands;
}

/** Deletes every marker at a tick; the tick-0 markers cannot be deleted. */
export function planMarkerDeletionCommands(
  state: EditorSessionState,
  clipId: ClipId,
  startTick: Tick,
): PianoRollCommand[] {
  const clip = getClip(state, clipId);
  const { timeMap } = clip.timeline;
  const commands: PianoRollCommand[] = [];

  if (startTick > 0 &&
    timeMap.meterMarkers.some((marker) => marker.startTick === startTick)
  ) {
    commands.push({ type: "DeleteMeterMarker", clipId, startTick });
  }

  if (startTick > 0 &&
    timeMap.tempoMarkers.some((marker) => marker.startTick === startTick)
  ) {
    commands.push({ type: "DeleteTempoMarker", clipId, startTick });
  }

  if (startTick > 0 &&
    timeMap.scaleMarkers.some((marker) => marker.startTick === startTick)
  ) {
    commands.push({ type: "DeleteScaleMarker", clipId, startTick });
  }

  if (
    timeMap.sectionMarkers.some((marker) => marker.startTick === startTick)
  ) {
    commands.push({ type: "DeleteSectionMarker", clipId, startTick });
  }

  return commands;
}

export interface MarkerMovePlan {
  readonly commands: readonly PianoRollCommand[];
  readonly collisions: readonly TimeMapMarkerCollision[];
}

/** Plans a point-marker move and optionally removes occupied point markers. */
export function planMarkerMove(
  state: EditorSessionState,
  clipId: ClipId,
  fromTick: Tick,
  toTick: Tick,
  overwriteCollisions = false,
): MarkerMovePlan {
  if (fromTick === toTick) {
    return { commands: [], collisions: [] };
  }

  const clip = getClip(state, clipId);
  const { timeMap } = clip.timeline;
  const moveCommands: PianoRollCommand[] = [];
  const groupTargetTick = toTick;

  const isMovingTempo = fromTick > 0
    && timeMap.tempoMarkers.some((marker) => marker.startTick === fromTick);
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

  const isMovingScale = fromTick > 0
    && timeMap.scaleMarkers.some((marker) => marker.startTick === fromTick);
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

  const isMovingSection = timeMap.sectionMarkers.some(
    (marker) => marker.startTick === fromTick,
  );
  const targetHasSection = timeMap.sectionMarkers.some(
    (marker) => marker.startTick === groupTargetTick,
  );

  if (isMovingSection) {
    if (targetHasSection && fromTick !== groupTargetTick) {
      collisions.push({ kind: "section", targetTick: groupTargetTick });
    }

    if (fromTick !== groupTargetTick) {
      moveCommands.push({
        type: "MoveSectionMarker",
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
      : collision.kind === "scale"
        ? "DeleteScaleMarker"
        : "DeleteSectionMarker",
    clipId,
    startTick: collision.targetTick,
  }));

  return {
    commands: [...deleteCommands, ...moveCommands],
    collisions,
  };
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
      const rootLabel = formatPitchClass(flag.rootNote);
      let scaleLabel = "";
      if (flag.patternType === "chord") {
        scaleLabel = formatMusicTheoryChordSymbol(flag.rootNote, flag.patternId);
      } else {
        scaleLabel = `${rootLabel} ${flag.patternId}`;
      }

      parts.push(scaleLabel);
    }
  }

  if (flag.sectionComment !== null) {
    parts.push(flag.sectionComment);
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


