import {
  PROJECT_CONSTANTS,
} from "../../project/project-constants";

export const DEFAULT_SYNTH_POLYPHONY =
  PROJECT_CONSTANTS.defaultSynthPolyphony;
export const MINIMUM_SYNTH_POLYPHONY =
  PROJECT_CONSTANTS.minimumSynthPolyphony;
export const MAXIMUM_SYNTH_POLYPHONY =
  PROJECT_CONSTANTS.maximumSynthPolyphony;

/** Persistent synth defaults and validation limits. */
export const SYNTH_CONSTANTS = Object.freeze({
  defaultOscillatorWaveform: "sawtooth",
  oscillatorDetuneCents: 0,
  oscillatorFreePhase: false,
  pulseWidth: 0.5,
  minimumPulseWidth: 0.05,
  maximumPulseWidth: 0.95,
  attackSeconds: 0.012,
  decaySeconds: 0.18,
  sustainLevel: 0.72,
  releaseSeconds: 0.42,
  filterCutoffHz: 8_000,
  minimumFilterCutoffHz: 20,
  maximumFilterCutoffHz: 20_000,
  filterResonance: 0.2,
  minimumFilterResonance: 0,
  maximumFilterResonance: 12,
  filterKeyTracking: 0,
  minimumFilterKeyTracking: 0,
  maximumFilterKeyTracking: 1,
  filterEnvelopeAmountOctaves: 1,
  minimumFilterEnvelopeAmountOctaves: 0,
  maximumFilterEnvelopeAmountOctaves: 8,
  filterAttackSeconds: 0.008,
  filterDecaySeconds: 0.32,
  filterSustainLevel: 0.28,
  filterReleaseSeconds: 0.36,
  envelopeCurve: 0.35,
  minimumEnvelopeCurve: -1,
  maximumEnvelopeCurve: 1,
  maximumEnvelopeTimeSeconds: 2,
  maximumEnvelopeDecaySeconds: 10,
} as const);
