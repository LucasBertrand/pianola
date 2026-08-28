import {
  PROJECT_CONSTANTS,
} from "../project/project-constants";
import type {
  EffectId,
  InstrumentId,
  PresetId,
  RuleId,
  Tick,
} from "../identifiers";

export const DEFAULT_SUBTRACTIVE_SYNTH_POLYPHONY =
  PROJECT_CONSTANTS.defaultSubtractiveSynthPolyphony;
export const MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY =
  PROJECT_CONSTANTS.minimumSubtractiveSynthPolyphony;
export const MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY =
  PROJECT_CONSTANTS.maximumSubtractiveSynthPolyphony;
export const MAXIMUM_INSTRUMENT_NAME_LENGTH =
  PROJECT_CONSTANTS.maximumInstrumentNameLength;
export const MAXIMUM_PROJECT_INSTRUMENT_COUNT =
  PROJECT_CONSTANTS.maximumInstrumentCount;
export const MAXIMUM_INSTRUMENT_DESCRIPTOR_COUNT =
  PROJECT_CONSTANTS.maximumInstrumentDescriptorCount;
export const MAXIMUM_DESCRIPTOR_PARAMETER_COUNT =
  PROJECT_CONSTANTS.maximumDescriptorParameterCount;

export interface AdsrEnvelope {
  readonly attackSeconds: number;
  readonly decaySeconds: number;
  readonly sustainLevel: number;
  readonly releaseSeconds: number;
  /** Segment shape from exponential (-1) through linear (0) to logarithmic (1). */
  readonly curve: number;
}

export type OscillatorWaveform =
  | "sine"
  | "square"
  | "sawtooth"
  | "triangle";

export interface SubtractiveSynthConfig {
  readonly kind: "subtractive";
  readonly oscillatorWaveform: OscillatorWaveform;
  readonly polyphony: number;
  readonly oscillatorDetuneCents: number;
  readonly oscillatorFreePhase: boolean;
  readonly pulseWidth: number;
  readonly envelope: AdsrEnvelope;
  readonly filterCutoffHz: number;
  readonly filterResonance: number;
  /** Cutoff pitch-follow amount: 0 is fixed and 1 is one octave per octave. */
  readonly filterKeyTracking: number;
  readonly filterEnvelopeAmountOctaves: number;
  readonly filterEnvelope: AdsrEnvelope;
}

export type InstrumentConfig = SubtractiveSynthConfig;

export interface SubtractiveSynthPreset {
  readonly id: PresetId;
  readonly name: string;
  readonly kind: "subtractive";
  readonly config: SubtractiveSynthConfig;
}

/** A named, reusable sound definition shared by every clip. */
export type InstrumentPreset = SubtractiveSynthPreset;

export type EffectParameterValue = number | boolean | string;

export interface EffectDescriptor {
  readonly id: EffectId;
  readonly kind: string;
  readonly enabled: boolean;
  readonly parameters: Readonly<Record<string, EffectParameterValue>>;
}

export interface GenerativeRuleDescriptor {
  readonly id: RuleId;
  readonly kind: string;
  readonly enabled: boolean;
  readonly parameters: Readonly<Record<string, number | boolean | string>>;
}

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
  readonly effects: readonly EffectDescriptor[];
  readonly generativeRules: readonly GenerativeRuleDescriptor[];
  readonly interpretation: ProjectInstrumentInterpretation;
}
