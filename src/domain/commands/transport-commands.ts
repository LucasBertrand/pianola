import {
  getClipMeasureCount,
  getClipTimeSignature,
  getTicksPerMeasure,
  MAXIMUM_MEASURE_COUNT,
  MINIMUM_MEASURE_COUNT,
} from "../model";
import type { ProjectState } from "../model";
import {
  assertValidClipTimeline,
  assertValidProjectClock,
  assertValidTransportState,
} from "../validation/transport-validation";
import type { ActiveClipProjectState } from "./active-clip-project-state";
import type {
  AppendMeasuresCommand,
  InsertMeasureCommand,
  RemoveMeasureCommand,
  SetLoopEnabledCommand,
  UpdateLoopCommand,
  UpdateTempoCommand,
  UpdateTimeSignatureCommand,
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

export function applyInsertMeasure(
  state: ActiveClipProjectState,
  command: InsertMeasureCommand,
): ActiveClipProjectState {
  const measureCount = getClipMeasureCount(state.clock, state);
  assertMeasureIndex(
    command.measureIndex,
    measureCount,
    command.type,
  );

  if (measureCount >= MAXIMUM_MEASURE_COUNT) {
    reject(
      "INVALID_COMMAND",
      `A project cannot contain more than ${MAXIMUM_MEASURE_COUNT} measures.`,
      command.type,
    );
  }

  const measureTicks = getTicksPerMeasure(
    state.clock,
    getClipTimeSignature(state),
  );
  const insertionTick =
    command.measureIndex * measureTicks;
  const tracksByInstrumentId = transformTracksForInsertedTime(
    state,
    insertionTick,
    measureTicks,
  );
  const transportSettings = insertTimeIntoTransport(
    state.transportSettings,
    insertionTick,
    measureTicks,
  );

  assertValidTransportState(transportSettings);
  const timeline = {
    ...state.timeline,
    durationTicks: state.timeline.durationTicks + measureTicks,
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
  const measureCount = getClipMeasureCount(state.clock, state);
  assertMeasureIndex(
    command.measureIndex,
    measureCount,
    command.type,
  );

  if (measureCount <= MINIMUM_MEASURE_COUNT) {
    reject(
      "INVALID_COMMAND",
      `A project must contain at least ${MINIMUM_MEASURE_COUNT} measure.`,
      command.type,
    );
  }

  const measureTicks = getTicksPerMeasure(
    state.clock,
    getClipTimeSignature(state),
  );
  const removalStartTick = command.measureIndex * measureTicks;
  const removalEndTick = removalStartTick + measureTicks;
  const tracksByInstrumentId = transformTracksForRemovedTime(
    state,
    removalStartTick,
    removalEndTick,
  );
  const transportSettings = removeTimeFromTransport(
    state.transportSettings,
    removalStartTick,
    removalEndTick,
    state.timeline.durationTicks - measureTicks,
  );

  assertValidTransportState(transportSettings);
  const timeline = {
    ...state.timeline,
    durationTicks: state.timeline.durationTicks - measureTicks,
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

  const currentMeasureCount = getClipMeasureCount(state.clock, state);
  const measureCount = currentMeasureCount + command.count;

  if (measureCount > MAXIMUM_MEASURE_COUNT) {
    reject(
      "INVALID_COMMAND",
      `A project cannot contain more than ${MAXIMUM_MEASURE_COUNT} measures.`,
      command.type,
    );
  }

  const measureTicks = getTicksPerMeasure(
    state.clock,
    getClipTimeSignature(state),
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

export function applyUpdateTempo(
  state: ProjectState,
  command: UpdateTempoCommand,
): ProjectState {
  const clock = {
    ...state.clock,
    tempoBpm: command.bpm,
  };

  assertValidProjectClock(clock);

  if (clock.tempoBpm === state.clock.tempoBpm) {
    return state;
  }

  return {
    ...state,
    clock,
  };
}

export function applyUpdateTimeSignature(
  state: ActiveClipProjectState,
  command: UpdateTimeSignatureCommand,
): ActiveClipProjectState {
  const currentTimeSignature = getClipTimeSignature(state);

  if (
    command.timeSignature.numerator
      === currentTimeSignature.numerator
    && command.timeSignature.denominator
      === currentTimeSignature.denominator
  ) {
    return state;
  }

  const measureCount = getClipMeasureCount(state.clock, state);
  const timeline = {
    durationTicks: measureCount * getTicksPerMeasure(
      state.clock,
      command.timeSignature,
    ),
    meterMap: {
      segments: [{
        startTick: 0,
        timeSignature: command.timeSignature,
      }],
    },
  };
  assertValidClipTimeline(timeline, state.clock);

  return trimProjectToDuration({
    ...state,
    timeline,
  });
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
