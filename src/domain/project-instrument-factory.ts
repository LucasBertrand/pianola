import {
  PROJECT_CONSTANTS,
  INSTRUMENT_CONSTANTS,
} from "../config/program-constants";
import type {
  ClipInstrumentState,
  PresetId,
  ProjectInstrument,
  InstrumentId,
} from "./model";
import {
  DEFAULT_INSTRUMENT_PRESET_ID,
} from "./instrument-presets";

export interface CreateDefaultProjectInstrumentOptions {
  readonly id: InstrumentId;
  readonly name: string;
  readonly color: string;
}

/** Creates a global instrument identity using the shared product defaults. */
export function createDefaultProjectInstrument(
  options: CreateDefaultProjectInstrumentOptions,
): ProjectInstrument {
  return {
    id: options.id,
    name: options.name,
    color: options.color,
    pan: INSTRUMENT_CONSTANTS.pan,
    effects: [],
    generativeRules: [],
    interpretation: {
      transposeSemitones:
        INSTRUMENT_CONSTANTS.transposeSemitones,
      timingOffsetTicks:
        INSTRUMENT_CONSTANTS.timingOffsetTicks,
      gateRatio: INSTRUMENT_CONSTANTS.gateRatio,
      velocityScale: INSTRUMENT_CONSTANTS.velocityScale,
      probability: INSTRUMENT_CONSTANTS.probability,
    },
  };
}

/** Creates default mixer and preset-selection state for one clip instrument. */
export function createDefaultClipInstrumentState(
  presetId: PresetId = DEFAULT_INSTRUMENT_PRESET_ID,
): ClipInstrumentState {
  return {
    gain: PROJECT_CONSTANTS.defaultClipInstrumentGain,
    muted: PROJECT_CONSTANTS.defaultClipInstrumentMuted,
    locked: PROJECT_CONSTANTS.defaultClipInstrumentLocked,
    solo: PROJECT_CONSTANTS.defaultClipInstrumentSolo,
    presetId,
  };
}
