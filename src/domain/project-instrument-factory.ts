import {
  PROJECT_CONSTANTS,
  INSTRUMENT_CONSTANTS,
} from "../config/domain-limits";
import {
  type InstrumentConfig,
  type ProjectInstrument,
} from "./instruments/instrument";
import {
  type InstrumentId,
} from "./identifiers";
export interface CreateDefaultProjectInstrumentOptions {
  readonly id: InstrumentId;
  readonly name: string;
  readonly color: string;
  readonly instrument: InstrumentConfig;
}

/** Creates a global instrument identity using the shared product defaults. */
export function createDefaultProjectInstrument(
  options: CreateDefaultProjectInstrumentOptions,
): ProjectInstrument {
  return {
    id: options.id,
    name: options.name,
    color: options.color,
    instrument: options.instrument,
    gain: PROJECT_CONSTANTS.defaultInstrumentGain,
    muted: PROJECT_CONSTANTS.defaultInstrumentMuted,
    solo: PROJECT_CONSTANTS.defaultInstrumentSolo,
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
