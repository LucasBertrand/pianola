import {
  MAXIMUM_MEASURE_COUNT,
  MINIMUM_MEASURE_COUNT,
} from "../clips/clip";
import {
  areTimeSignaturesEqual,
  getMeasureCount,
  getMeasureSpans,
  getTicksPerMeasure,
  insertMeterMarker,
  insertTempoMarker,
  insertTimeIntoTimeMap,
  moveMeterMarker,
  moveTempoMarker,
  removeMeterMarker,
  removeTempoMarker,
  removeScaleMarker,
  removeTimeFromTimeMap,
  replaceInitialMeter,
  updateMeterMarker,
  updateTempoMarker,
  updateScaleMarker,
  insertScaleMarker,
  moveScaleMarker,
  type MeterMarkerEdit,
  type TimeMap,
} from "../transport/time-map";
import {
  assertValidClipTimeline,
  assertValidTransportState,
} from "../validation/transport-validation";
import type { ActiveClipProjectState } from "./active-clip-project-state";
import type {
  AddMeterMarkerCommand,
  AddTempoMarkerCommand,
  AppendMeasuresCommand,
  DeleteMeterMarkerCommand,
  DeleteTempoMarkerCommand,
  InsertMeasureCommand,
  MoveMeterMarkerCommand,
  MoveTempoMarkerCommand,
  RemoveMeasureCommand,
  SetLoopEnabledCommand,
  UpdateLoopCommand,
  UpdateMeterMarkerCommand,
  UpdateTempoCommand,
  UpdateTempoMarkerCommand,
  UpdateTimeSignatureCommand,
  AddScaleMarkerCommand,
  MoveScaleMarkerCommand,
  UpdateScaleMarkerCommand,
  DeleteScaleMarkerCommand,
} from "./command-types";
import {
  assertMeasureIndex,
  insertTimeIntoTransport,
  removeTimeFromTransport,
  transformTracksForInsertedTime,
  transformTracksForRemovedTime,
  trimProjectToDuration,
} from "./active-clip-command-helpers";
import {
  assertTransportWithinProjectDuration,
  reject,
} from "./command-context";
import type { PianoRollCommand } from "./command-types";

export function applyInsertMeasure(
  state: ActiveClipProjectState,
  command: InsertMeasureCommand,
): ActiveClipProjectState {
  const spans = getMeasureSpans(
    state.clock.ppqn,
    state.timeline.timeMap,
    state.timeline.durationTicks,
  );
  assertMeasureIndex(command.measureIndex, spans.length, command.type);

  if (spans.length >= MAXIMUM_MEASURE_COUNT) {
    reject(
      "INVALID_COMMAND",
      `A project cannot contain more than ${MAXIMUM_MEASURE_COUNT} measures.`,
      command.type,
    );
  }

  const span = spans[command.measureIndex];

  if (span === undefined) {
    reject(
      "INVALID_COMMAND",
      `Measure ${String(command.measureIndex + 1)} does not exist.`,
      command.type,
    );
  }

  const insertionTick = span.startTick;
  const insertedTicks = span.endTick - span.startTick;
  const tracksByInstrumentId = transformTracksForInsertedTime(
    state,
    insertionTick,
    insertedTicks,
  );
  const transportSettings = insertTimeIntoTransport(
    state.transportSettings,
    insertionTick,
    insertedTicks,
  );
  const timeMap = insertTimeIntoTimeMap(
    state.timeline.timeMap,
    insertionTick,
    insertedTicks,
  );

  assertValidTransportState(transportSettings);
  const timeline = {
    durationTicks: state.timeline.durationTicks + insertedTicks,
    timeMap,
  };
  assertValidClipTimeline(timeline, state.clock);

  return {
    ...state,
    timeline,
    tracksByInstrumentId,
    transportSettings,
  };
}

export function applyRemoveMeasure(
  state: ActiveClipProjectState,
  command: RemoveMeasureCommand,
): ActiveClipProjectState {
  const spans = getMeasureSpans(
    state.clock.ppqn,
    state.timeline.timeMap,
    state.timeline.durationTicks,
  );
  assertMeasureIndex(command.measureIndex, spans.length, command.type);

  if (spans.length <= MINIMUM_MEASURE_COUNT) {
    reject(
      "INVALID_COMMAND",
      `A project must contain at least ${MINIMUM_MEASURE_COUNT} measure.`,
      command.type,
    );
  }

  const span = spans[command.measureIndex];

  if (span === undefined) {
    reject(
      "INVALID_COMMAND",
      `Measure ${String(command.measureIndex + 1)} does not exist.`,
      command.type,
    );
  }

  const removalStartTick = span.startTick;
  const removalEndTick = span.endTick;
  const tracksByInstrumentId = transformTracksForRemovedTime(
    state,
    removalStartTick,
    removalEndTick,
  );
  const edit = applyMarkerOperation(command, () =>
    removeTimeFromTimeMap(
      state.clock.ppqn,
      state.timeline.timeMap,
      state.timeline.durationTicks,
      removalStartTick,
      removalEndTick,
    ));
  const transportSettings = removeTimeFromTransport(
    state.transportSettings,
    removalStartTick,
    removalEndTick,
    edit.durationTicks,
  );

  assertValidTransportState(transportSettings);
  const timeline = {
    durationTicks: edit.durationTicks,
    timeMap: edit.timeMap,
  };
  assertValidClipTimeline(timeline, state.clock);

  return {
    ...state,
    timeline,
    tracksByInstrumentId,
    transportSettings,
  };
}

export function applyAppendMeasures(
  state: ActiveClipProjectState,
  command: AppendMeasuresCommand,
): ActiveClipProjectState {
  if (!Number.isSafeInteger(command.count) || command.count <= 0) {
    reject(
      "INVALID_COMMAND",
      "The appended measure count must be a positive safe integer.",
      command.type,
    );
  }

  const currentMeasureCount = getMeasureCount(
    state.clock.ppqn,
    state.timeline.timeMap,
    state.timeline.durationTicks,
  );
  const measureCount = currentMeasureCount + command.count;

  if (measureCount > MAXIMUM_MEASURE_COUNT) {
    reject(
      "INVALID_COMMAND",
      `A project cannot contain more than ${MAXIMUM_MEASURE_COUNT} measures.`,
      command.type,
    );
  }

  const spans = getMeasureSpans(
    state.clock.ppqn,
    state.timeline.timeMap,
    state.timeline.durationTicks,
  );
  const lastSpan = spans[spans.length - 1];

  if (lastSpan === undefined) {
    reject(
      "INVALID_COMMAND",
      "A clip must contain at least one measure.",
      command.type,
    );
  }

  const measureTicks = getTicksPerMeasure(
    state.clock.ppqn,
    lastSpan.timeSignature,
  );
  const timeline = {
    ...state.timeline,
    durationTicks: state.timeline.durationTicks + command.count * measureTicks,
  };
  assertValidClipTimeline(timeline, state.clock);

  return {
    ...state,
    timeline,
  };
}

/** Edits the tempo marker at tick 0 of the clip. */
export function applyUpdateTempo(
  state: ActiveClipProjectState,
  command: UpdateTempoCommand,
): ActiveClipProjectState {
  const initialMarker = state.timeline.timeMap.tempoMarkers[0];

  if (initialMarker === undefined) {
    reject(
      "INVALID_COMMAND",
      "A clip must contain a tempo marker at tick 0.",
      command.type,
    );
  }

  if (command.bpm === initialMarker.bpm) {
    return state;
  }

  const timeMap = applyMarkerOperation(command, () =>
    updateTempoMarker(state.timeline.timeMap, 0, command.bpm));

  return withTimeMap(state, timeMap);
}

/**
 * Edits the meter marker at tick 0. Other markers keep their measure index
 * and the total measure count is preserved; notes past the new duration are
 * trimmed.
 */
export function applyUpdateTimeSignature(
  state: ActiveClipProjectState,
  command: UpdateTimeSignatureCommand,
): ActiveClipProjectState {
  const currentTimeSignature =
    state.timeline.timeMap.meterMarkers[0]?.timeSignature;

  if (currentTimeSignature === undefined) {
    reject(
      "INVALID_COMMAND",
      "A clip must contain a meter marker at tick 0.",
      command.type,
    );
  }

  if (areTimeSignaturesEqual(command.timeSignature, currentTimeSignature)) {
    return state;
  }

  const { timeMap, durationTicks } = applyMarkerOperation(command, () =>
    replaceInitialMeter(
      state.clock.ppqn,
      state.timeline.timeMap,
      state.timeline.durationTicks,
      command.timeSignature,
    ));
  const timeline = { durationTicks, timeMap };
  assertValidClipTimeline(timeline, state.clock);

  return trimProjectToDuration({
    ...state,
    timeline,
  });
}

export function applyAddMeterMarker(
  state: ActiveClipProjectState,
  command: AddMeterMarkerCommand,
): ActiveClipProjectState {
  const edit = applyMarkerOperation(command, () =>
    insertMeterMarker(
      state.clock.ppqn,
      state.timeline.timeMap,
      state.timeline.durationTicks,
      {
        startTick: command.startTick,
        timeSignature: command.timeSignature,
      },
    ));

  return withMeterEdit(state, edit);
}

export function applyMoveMeterMarker(
  state: ActiveClipProjectState,
  command: MoveMeterMarkerCommand,
): ActiveClipProjectState {
  if (command.startTick === command.targetTick) {
    return state;
  }

  const edit = applyMarkerOperation(command, () =>
    moveMeterMarker(
      state.clock.ppqn,
      state.timeline.timeMap,
      state.timeline.durationTicks,
      command.startTick,
      command.targetTick,
    ));

  return withMeterEdit(state, edit);
}

export function applyUpdateMeterMarker(
  state: ActiveClipProjectState,
  command: UpdateMeterMarkerCommand,
): ActiveClipProjectState {
  const edit = applyMarkerOperation(command, () =>
    updateMeterMarker(
      state.clock.ppqn,
      state.timeline.timeMap,
      state.timeline.durationTicks,
      command.startTick,
      command.timeSignature,
    ));

  return withMeterEdit(state, edit);
}

export function applyDeleteMeterMarker(
  state: ActiveClipProjectState,
  command: DeleteMeterMarkerCommand,
): ActiveClipProjectState {
  const edit = applyMarkerOperation(command, () =>
    removeMeterMarker(
      state.clock.ppqn,
      state.timeline.timeMap,
      state.timeline.durationTicks,
      command.startTick,
    ));

  return withMeterEdit(state, edit);
}

export function applyAddTempoMarker(
  state: ActiveClipProjectState,
  command: AddTempoMarkerCommand,
): ActiveClipProjectState {
  const timeMap = applyMarkerOperation(command, () =>
    insertTempoMarker(
      state.timeline.timeMap,
      state.timeline.durationTicks,
      { startTick: command.startTick, bpm: command.bpm },
    ));

  return withTimeMap(state, timeMap);
}

export function applyMoveTempoMarker(
  state: ActiveClipProjectState,
  command: MoveTempoMarkerCommand,
): ActiveClipProjectState {
  if (command.startTick === command.targetTick) {
    return state;
  }

  const timeMap = applyMarkerOperation(command, () =>
    moveTempoMarker(
      state.timeline.timeMap,
      command.startTick,
      command.targetTick,
    ));

  return withTimeMap(state, timeMap);
}

export function applyUpdateTempoMarker(
  state: ActiveClipProjectState,
  command: UpdateTempoMarkerCommand,
): ActiveClipProjectState {
  const marker = state.timeline.timeMap.tempoMarkers.find(
    (candidate) => candidate.startTick === command.startTick,
  );

  if (marker !== undefined && marker.bpm === command.bpm) {
    return state;
  }

  const timeMap = applyMarkerOperation(command, () =>
    updateTempoMarker(
      state.timeline.timeMap,
      command.startTick,
      command.bpm,
    ));

  return withTimeMap(state, timeMap);
}

export function applyDeleteTempoMarker(
  state: ActiveClipProjectState,
  command: DeleteTempoMarkerCommand,
): ActiveClipProjectState {
  const timeMap = applyMarkerOperation(command, () =>
    removeTempoMarker(state.timeline.timeMap, command.startTick));

  return withTimeMap(state, timeMap);
}

export function applyAddScaleMarker(
  state: ActiveClipProjectState,
  command: AddScaleMarkerCommand,
): ActiveClipProjectState {
  const timeMap = applyMarkerOperation(command, () =>
    insertScaleMarker(
      state.timeline.timeMap,
      state.timeline.durationTicks,
      command.marker,
    ));

  return withTimeMap(state, timeMap);
}

export function applyMoveScaleMarker(
  state: ActiveClipProjectState,
  command: MoveScaleMarkerCommand,
): ActiveClipProjectState {
  if (command.startTick === command.targetTick) {
    return state;
  }

  const timeMap = applyMarkerOperation(command, () =>
    moveScaleMarker(
      state.timeline.timeMap,
      command.startTick,
      command.targetTick,
    ));

  return withTimeMap(state, timeMap);
}

export function applyUpdateScaleMarker(
  state: ActiveClipProjectState,
  command: UpdateScaleMarkerCommand,
): ActiveClipProjectState {
  const timeMap = applyMarkerOperation(command, () =>
    updateScaleMarker(
      state.timeline.timeMap,
      command.startTick,
      command.changes,
    ));

  return withTimeMap(state, timeMap);
}

export function applyDeleteScaleMarker(
  state: ActiveClipProjectState,
  command: DeleteScaleMarkerCommand,
): ActiveClipProjectState {
  const timeMap = applyMarkerOperation(command, () =>
    removeScaleMarker(state.timeline.timeMap, command.startTick));

  return withTimeMap(state, timeMap);
}

export function applyUpdateLoop(
  state: ActiveClipProjectState,
  command: UpdateLoopCommand,
): ActiveClipProjectState {
  const transportSettings = {
    ...state.transportSettings,
    loop: command.loop,
  };

  assertValidTransportState(transportSettings);
  assertTransportWithinProjectDuration(
    state,
    transportSettings,
    command.type,
  );

  if (
    command.loop.startTick === state.transportSettings.loop.startTick
    && command.loop.endTick === state.transportSettings.loop.endTick
  ) {
    return state;
  }

  return {
    ...state,
    transportSettings,
  };
}

export function applySetLoopEnabled(
  state: ActiveClipProjectState,
  command: SetLoopEnabledCommand,
): ActiveClipProjectState {
  if (typeof command.enabled !== "boolean") {
    reject(
      "INVALID_COMMAND",
      "Loop enabled state must be a boolean.",
      command.type,
    );
  }

  if (command.enabled === state.transportSettings.loopEnabled) {
    return state;
  }

  return {
    ...state,
    transportSettings: {
      ...state.transportSettings,
      loopEnabled: command.enabled,
    },
  };
}

function applyMarkerOperation<T>(
  command: PianoRollCommand,
  operation: () => T,
): T {
  try {
    return operation();
  } catch (error: unknown) {
    if (error instanceof RangeError) {
      reject("INVALID_COMMAND", error.message, command.type);
    }

    throw error;
  }
}

/**
 * Applies a meter edit: the recomputed duration replaces the clip duration
 * and content past it is trimmed, mirroring the time-signature control.
 */
function withMeterEdit(
  state: ActiveClipProjectState,
  edit: MeterMarkerEdit,
): ActiveClipProjectState {
  const timeline = {
    durationTicks: edit.durationTicks,
    timeMap: edit.timeMap,
  };

  assertValidClipTimeline(timeline, state.clock);

  return trimProjectToDuration({
    ...state,
    timeline,
  });
}

function withTimeMap(
  state: ActiveClipProjectState,
  timeMap: TimeMap,
): ActiveClipProjectState {
  if (timeMap === state.timeline.timeMap) {
    return state;
  }

  const timeline = {
    ...state.timeline,
    timeMap,
  };

  assertValidClipTimeline(timeline, state.clock);

  return {
    ...state,
    timeline,
  };
}
