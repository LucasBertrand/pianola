import {
  type EditorSessionState,
} from "../project/project-document";
import {
  MAXIMUM_MASTER_GAIN,
  MAXIMUM_MASTER_TUNING_FREQUENCY_HZ,
  MINIMUM_MASTER_GAIN,
  MINIMUM_MASTER_TUNING_FREQUENCY_HZ,
} from "../master-bus";
import {
  MAXIMUM_PROJECT_TITLE_LENGTH,
} from "../project/project-document";
import type {
  SetAutoAdvanceEnabledCommand,
  SetAutoScrollEnabledCommand,
  SetMasterMutedCommand,
  UpdateMasterGainCommand,
  UpdateMasterTuningCommand,
  UpdateProjectTitleCommand,
} from "./command-types";
import { reject } from "./command-context";

export function applySetAutoAdvanceEnabled(
  state: EditorSessionState,
  command: SetAutoAdvanceEnabledCommand,
): EditorSessionState {
  if (typeof command.enabled !== "boolean") {
    reject(
      "INVALID_COMMAND",
      "Project auto-advance state must be a boolean.",
      command.type,
    );
  }

  return command.enabled === state.autoAdvanceEnabled
    ? state
    : { ...state, autoAdvanceEnabled: command.enabled };
}

export function applySetAutoScrollEnabled(
  state: EditorSessionState,
  command: SetAutoScrollEnabledCommand,
): EditorSessionState {
  if (typeof command.enabled !== "boolean") {
    reject(
      "INVALID_COMMAND",
      "Project playhead auto-scroll state must be a boolean.",
      command.type,
    );
  }

  return command.enabled === state.autoScrollEnabled
    ? state
    : { ...state, autoScrollEnabled: command.enabled };
}

export function applyUpdateProjectTitle(
  state: EditorSessionState,
  command: UpdateProjectTitleCommand,
): EditorSessionState {
  const title = command.title.trim();

  if (
    title.length === 0
    || title.length > MAXIMUM_PROJECT_TITLE_LENGTH
  ) {
    reject(
      "INVALID_COMMAND",
      `Project title must contain between 1 and ${MAXIMUM_PROJECT_TITLE_LENGTH} characters.`,
      command.type,
    );
  }

  if (title === state.title) {
    return state;
  }

  return {
    ...state,
    title,
  };
}

export function applyUpdateMasterGain(
  state: EditorSessionState,
  command: UpdateMasterGainCommand,
): EditorSessionState {
  if (
    !Number.isFinite(command.gain)
    || command.gain < MINIMUM_MASTER_GAIN
    || command.gain > MAXIMUM_MASTER_GAIN
  ) {
    reject(
      "INVALID_COMMAND",
      `Master gain must be between ${MINIMUM_MASTER_GAIN} and ${MAXIMUM_MASTER_GAIN}.`,
      command.type,
    );
  }

  if (command.gain === state.masterBus.gain) {
    return state;
  }

  return {
    ...state,
    masterBus: {
      ...state.masterBus,
      gain: command.gain,
    },
  };
}

export function applySetMasterMuted(
  state: EditorSessionState,
  command: SetMasterMutedCommand,
): EditorSessionState {
  if (typeof command.muted !== "boolean") {
    reject(
      "INVALID_COMMAND",
      "Master mute state must be a boolean.",
      command.type,
    );
  }

  if (command.muted === state.masterBus.muted) {
    return state;
  }

  return {
    ...state,
    masterBus: {
      ...state.masterBus,
      muted: command.muted,
    },
  };
}

export function applyUpdateMasterTuning(
  state: EditorSessionState,
  command: UpdateMasterTuningCommand,
): EditorSessionState {
  if (
    !Number.isFinite(command.tuningFrequencyHz)
    || command.tuningFrequencyHz
      < MINIMUM_MASTER_TUNING_FREQUENCY_HZ
    || command.tuningFrequencyHz
      > MAXIMUM_MASTER_TUNING_FREQUENCY_HZ
  ) {
    reject(
      "INVALID_COMMAND",
      `Master tuning must be between ${MINIMUM_MASTER_TUNING_FREQUENCY_HZ} and ${MAXIMUM_MASTER_TUNING_FREQUENCY_HZ} Hz.`,
      command.type,
    );
  }

  if (
    command.tuningFrequencyHz
    === state.masterBus.tuningFrequencyHz
  ) {
    return state;
  }

  return {
    ...state,
    masterBus: {
      ...state.masterBus,
      tuningFrequencyHz: command.tuningFrequencyHz,
    },
  };
}
