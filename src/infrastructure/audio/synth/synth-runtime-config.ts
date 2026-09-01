import type {
  OscillatorWaveform,
} from "../../../domain/instruments/synth/synth-config";

export interface SynthEnvelopeRuntimeConfig {
  readonly attackSeconds: number;
  readonly decaySeconds: number;
  readonly sustainLevel: number;
  readonly releaseSeconds: number;
  readonly curve: number;
}

export interface SynthOscillatorRuntimeConfig {
  readonly waveform: OscillatorWaveform;
  readonly detuneCents: number;
  readonly freePhase: boolean;
  readonly pulseWidth: number;
}

export interface SynthFilterRuntimeConfig {
  readonly cutoffHz: number;
  readonly resonance: number;
  readonly keyTracking: number;
  readonly envelopeAmountOctaves: number;
}

/** Worklet-facing configuration. It is never persisted as project data. */
export interface SynthRuntimeConfig {
  readonly kind: "synth-runtime";
  readonly polyphony: number;
  readonly oscillator: SynthOscillatorRuntimeConfig;
  readonly amplitudeEnvelope: SynthEnvelopeRuntimeConfig;
  readonly filter: SynthFilterRuntimeConfig;
  readonly filterEnvelope: SynthEnvelopeRuntimeConfig;
}
