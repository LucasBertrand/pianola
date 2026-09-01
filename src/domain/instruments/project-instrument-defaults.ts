import type {
  InstrumentId,
} from "../identifiers";
import {
  PROJECT_CONSTANTS,
} from "../project/project-constants";
import type {
  InstrumentConfig,
} from "./synth/synth-config";
import type {
  ProjectInstrument,
} from "./project-instrument";

export interface CreateDefaultProjectInstrumentOptions {
  readonly id: InstrumentId;
  readonly name: string;
  readonly color: string;
  readonly instrument: InstrumentConfig;
}

const PROJECT_INSTRUMENT_DEFAULTS = Object.freeze({
  pan: 0,
  transposeSemitones: 0,
  timingOffsetTicks: 0,
  gateRatio: 1,
  velocityScale: 1,
  probability: 1,
} as const);

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
    pan: PROJECT_INSTRUMENT_DEFAULTS.pan,
    effects: [],
    generativeRules: [],
    interpretation: {
      transposeSemitones: PROJECT_INSTRUMENT_DEFAULTS.transposeSemitones,
      timingOffsetTicks: PROJECT_INSTRUMENT_DEFAULTS.timingOffsetTicks,
      gateRatio: PROJECT_INSTRUMENT_DEFAULTS.gateRatio,
      velocityScale: PROJECT_INSTRUMENT_DEFAULTS.velocityScale,
      probability: PROJECT_INSTRUMENT_DEFAULTS.probability,
    },
  };
}
