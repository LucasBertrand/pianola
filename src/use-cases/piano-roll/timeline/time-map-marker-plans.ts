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
  getMeasureSpans,
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
    bpm: tempoMarker?.bpm ?? getTempoAtTick(timeMap, tick),
    timeSignature: null,
    rootNote: scaleMarker?.rootNote ?? activeScaleMarker.rootNote,
    patternType: scaleMarker?.patternType ?? activeScaleMarker.patternType,
    patternId: scaleMarker?.patternId ?? activeScaleMarker.patternId,
    canDelete: hasMarker && tick > 0,
  };
}

/**
 * Turns a validated draft into the minimal command list: only effective
 * changes produce commands, so a no-op confirmation stays out of history.
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

  if (draft.timeSignature !== null) {
    const timeSignature = normalizeDraftTimeSignature(draft.timeSignature);
    const meterMarker = timeMap.meterMarkers.find(
      (marker) => marker.startTick === draft.startTick,
    );
    const activeMeter = getMeterAtTick(timeMap, draft.startTick);

    if (meterMarker !== undefined) {
      if (!isSameMeter(meterMarker.timeSignature, timeSignature)) {
        commands.push({
          type: "UpdateMeterMarker",
          clipId,
          startTick: draft.startTick,
          timeSignature,
        });
      }
    } else if (!isSameMeter(activeMeter, timeSignature)) {
      commands.push({
        type: "AddMeterMarker",
        clipId,
        startTick: draft.startTick,
        timeSignature,
      });
    }
  }

  const tempoMarker = timeMap.tempoMarkers.find(
    (marker) => marker.startTick === draft.startTick,
  );
  const previousTempo = getTempoAtTick(
    timeMap,
    Math.max(0, draft.startTick - 1),
  );

  if (tempoMarker !== undefined) {
    if (previousTempo === bpm && draft.startTick > 0) {
      commands.push({
        type: "DeleteTempoMarker",
        clipId,
        startTick: draft.startTick,
      });
    } else if (tempoMarker.bpm !== bpm) {
      commands.push({
        type: "UpdateTempoMarker",
        clipId,
        startTick: draft.startTick,
        bpm,
      });
    }
  } else if (previousTempo !== bpm) {
    commands.push({
      type: "AddTempoMarker",
      clipId,
      startTick: draft.startTick,
      bpm,
    });
  }

  const scaleMarker = timeMap.scaleMarkers.find(m => m.startTick === draft.startTick);
  const previousScaleMarker = getScaleMarkerAtTick(timeMap, Math.max(0, draft.startTick - 1));

  if (scaleMarker !== undefined) {
    if (
      previousScaleMarker.rootNote === draft.rootNote &&
      previousScaleMarker.patternType === draft.patternType &&
      previousScaleMarker.patternId === draft.patternId &&
      draft.startTick > 0
    ) {
      commands.push({
        type: "DeleteScaleMarker",
        clipId,
        startTick: draft.startTick,
      });
    } else if (
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
  } else if (
    previousScaleMarker.rootNote !== draft.rootNote ||
    previousScaleMarker.patternType !== draft.patternType ||
    previousScaleMarker.patternId !== draft.patternId
  ) {
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

/**
 * Moves the marker group at `fromTick` to `toTick`. The tempo companion only
 * follows when the target tick is free of tempo markers.
 */
export function planMarkerMoveCommands(
  state: ProjectState,
  clipId: ClipId,
  fromTick: Tick,
  toTick: Tick,
): PianoRollCommand[] {
  if (fromTick === toTick) {
    return [];
  }

  const clip = getClip(state, clipId);
  const { timeMap, durationTicks } = clip.timeline;
  const commands: PianoRollCommand[] = [];

  const hasMeter = timeMap.meterMarkers.some((marker) => marker.startTick === fromTick);
  let tempoTargetTick = toTick;

  if (hasMeter) {
    const targetHasMeter = timeMap.meterMarkers.some((marker) => marker.startTick === toTick);
    if (targetHasMeter) {
      throw new Error("A meter marker already exists at this position.");
    }

    commands.push({
      type: "MoveMeterMarker",
      clipId,
      startTick: fromTick,
      targetTick: toTick,
    });

    try {
      const edit = moveMeterMarker(
        state.clock.ppqn,
        timeMap,
        durationTicks,
        fromTick,
        toTick,
      );
      const oldSpans = getMeasureSpans(
        state.clock.ppqn,
        timeMap,
        durationTicks,
      );
      const targetSpanIndex = oldSpans.find(
        (s) => s.startTick === toTick,
      )?.index;
      const nextSpans = getMeasureSpans(
        state.clock.ppqn,
        edit.timeMap,
        edit.durationTicks,
      );
      const newSpan = nextSpans.find((s) => s.index === targetSpanIndex);

      if (newSpan !== undefined) {
        tempoTargetTick = newSpan.startTick;
      }
    } catch {
      // Ignored
    }
  }

  const isMovingTempo = timeMap.tempoMarkers.some((marker) => marker.startTick === fromTick);
  const targetHasTempo = timeMap.tempoMarkers.some((marker) => marker.startTick === tempoTargetTick);

  if (isMovingTempo) {
    if (targetHasTempo && fromTick !== tempoTargetTick) {
      throw new Error("A tempo marker already exists at this position.");
    }

    if (fromTick !== tempoTargetTick) {
      commands.push({
        type: "MoveTempoMarker",
        clipId,
        startTick: fromTick,
        targetTick: tempoTargetTick,
      });
    }
  }

  const isMovingScale = timeMap.scaleMarkers.some((marker) => marker.startTick === fromTick);
  const targetHasScale = timeMap.scaleMarkers.some((marker) => marker.startTick === tempoTargetTick);

  if (isMovingScale) {
    if (targetHasScale && fromTick !== tempoTargetTick) {
      throw new Error("A scale marker already exists at this position.");
    }

    if (fromTick !== tempoTargetTick) {
      commands.push({
        type: "MoveScaleMarker",
        clipId,
        startTick: fromTick,
        targetTick: tempoTargetTick,
      });
    }
  }

  return commands;
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


