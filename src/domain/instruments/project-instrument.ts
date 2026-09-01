import {
  PROJECT_CONSTANTS,
} from "../project/project-constants";
import type {
  InstrumentId,
  Tick,
} from "../identifiers";
import type {
  EffectDescriptor,
  GenerativeRuleDescriptor,
} from "./instrument-descriptors";
import type {
  InstrumentConfig,
} from "./synth/synth-config";

export const MAXIMUM_INSTRUMENT_NAME_LENGTH =
  PROJECT_CONSTANTS.maximumInstrumentNameLength;
export const MAXIMUM_PROJECT_INSTRUMENT_COUNT =
  PROJECT_CONSTANTS.maximumInstrumentCount;
export const MAXIMUM_INSTRUMENT_DESCRIPTOR_COUNT =
  PROJECT_CONSTANTS.maximumInstrumentDescriptorCount;
export const MAXIMUM_DESCRIPTOR_PARAMETER_COUNT =
  PROJECT_CONSTANTS.maximumDescriptorParameterCount;

export interface ProjectInstrumentInterpretation {
  readonly transposeSemitones: number;
  readonly timingOffsetTicks: Tick;
  readonly gateRatio: number;
  readonly velocityScale: number;
  readonly probability: number;
}

export interface ProjectInstrument {
  readonly id: InstrumentId;
  readonly name: string;
  readonly color: string;
  readonly instrument: InstrumentConfig;
  readonly gain: number;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly pan: number;
  /** Persisted descriptor; audio activation is outside the current product contract. */
  readonly effects: readonly EffectDescriptor[];
  /** Persisted descriptor; audio activation is outside the current product contract. */
  readonly generativeRules: readonly GenerativeRuleDescriptor[];
  /** Persisted interpretation metadata; currently dormant in audio rendering. */
  readonly interpretation: ProjectInstrumentInterpretation;
}
