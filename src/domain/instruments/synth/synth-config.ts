import type {
  AdsrEnvelope,
} from "./synth-envelope";

export type OscillatorWaveform =
  | "sine"
  | "square"
  | "sawtooth"
  | "triangle";

export interface SynthConfig {
  readonly kind: "synth";
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

export type InstrumentConfig = SynthConfig;
