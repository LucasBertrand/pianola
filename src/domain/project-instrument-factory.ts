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
  readonly presetId?: PresetId;
}

/** Creates a global instrument identity using the shared product defaults. */
export function createDefaultProjectInstrument(
  options: CreateDefaultProjectInstrumentOptions,
): ProjectInstrument {
  return {
    id: options.id,
    name: options.name,
    color: options.color,
    presetId: options.presetId ?? DEFAULT_INSTRUMENT_PRESET_ID,
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

/** Creates default mixer and editing state for one clip instrument. */
export function createDefaultClipInstrumentState(): ClipInstrumentState {
  return {
    gain: PROJECT_CONSTANTS.defaultClipInstrumentGain,
    muted: PROJECT_CONSTANTS.defaultClipInstrumentMuted,
    locked: PROJECT_CONSTANTS.defaultClipInstrumentLocked,
    solo: PROJECT_CONSTANTS.defaultClipInstrumentSolo,
  };
}
