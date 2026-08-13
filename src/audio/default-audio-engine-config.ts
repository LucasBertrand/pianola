import {
  AUDIO_CONSTANTS,
} from "../config/audio-config";
import {
  PROJECT_CONSTANTS,
} from "../config/domain-limits";
import {
  MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
} from "../domain/instruments/instrument";
import type {
  AudioEngineConfig,
} from "./audio-engine-config";

export const DEFAULT_AUDIO_ENGINE_CONFIG: AudioEngineConfig =
  Object.freeze({
    latencyHint: AUDIO_CONSTANTS.latencyHint,
    schedulerPulseIntervalMs: AUDIO_CONSTANTS.schedulerPulseIntervalMs,
    scheduleAheadSeconds: AUDIO_CONSTANTS.scheduleAheadSeconds,
    lateEventToleranceSeconds: AUDIO_CONSTANTS.lateEventToleranceSeconds,
    latencyCompensationSeconds: AUDIO_CONSTANTS.latencyCompensationSeconds,
    masterGain: PROJECT_CONSTANTS.defaultMasterGain,
    maximumRendererPolyphony: MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
    releaseTailSeconds: AUDIO_CONSTANTS.releaseTailSeconds,
  });
