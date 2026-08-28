import {
  PROJECT_CONSTANTS,
} from "./project/project-constants";

export const DEFAULT_MASTER_GAIN =
  PROJECT_CONSTANTS.defaultMasterGain;
export const MINIMUM_MASTER_GAIN =
  PROJECT_CONSTANTS.minimumMasterGain;
export const MAXIMUM_MASTER_GAIN =
  PROJECT_CONSTANTS.maximumMasterGain;
export const DEFAULT_MASTER_TUNING_FREQUENCY_HZ =
  PROJECT_CONSTANTS.defaultMasterTuningFrequencyHz;
export const MINIMUM_MASTER_TUNING_FREQUENCY_HZ =
  PROJECT_CONSTANTS.minimumMasterTuningFrequencyHz;
export const MAXIMUM_MASTER_TUNING_FREQUENCY_HZ =
  PROJECT_CONSTANTS.maximumMasterTuningFrequencyHz;

export interface MasterBusState {
  readonly gain: number;
  readonly muted: boolean;
  readonly tuningFrequencyHz: number;
}

export function createDefaultMasterBusState(): MasterBusState {
  return {
    gain: DEFAULT_MASTER_GAIN,
    muted: PROJECT_CONSTANTS.defaultMasterMuted,
    tuningFrequencyHz: DEFAULT_MASTER_TUNING_FREQUENCY_HZ,
  };
}
