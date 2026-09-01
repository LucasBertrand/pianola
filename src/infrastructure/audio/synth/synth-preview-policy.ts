import type {
  SynthRuntimeConfig,
} from "./synth-runtime-config";

export type SynthParameterPreviewBehavior =
  | "active-immediate"
  | "active-smoothed"
  | "next-note"
  | "processor-restart";

type PreviewPolicy<T> = {
  readonly [Key in keyof T]: T[Key] extends object
    ? PreviewPolicy<T[Key]>
    : SynthParameterPreviewBehavior;
};

/** Exhaustive preview classification aligned with the runtime DTO shape. */
export const SYNTH_PREVIEW_POLICY = Object.freeze({
  kind: "processor-restart",
  polyphony: "next-note",
  oscillator: Object.freeze({
    waveform: "active-immediate",
    detuneCents: "active-smoothed",
    freePhase: "next-note",
    pulseWidth: "active-smoothed",
  }),
  amplitudeEnvelope: Object.freeze({
    attackSeconds: "next-note",
    decaySeconds: "next-note",
    sustainLevel: "active-smoothed",
    releaseSeconds: "next-note",
    curve: "active-smoothed",
  }),
  filter: Object.freeze({
    cutoffHz: "active-smoothed",
    resonance: "active-smoothed",
    keyTracking: "active-smoothed",
    envelopeAmountOctaves: "active-smoothed",
  }),
  filterEnvelope: Object.freeze({
    attackSeconds: "next-note",
    decaySeconds: "next-note",
    sustainLevel: "active-smoothed",
    releaseSeconds: "next-note",
    curve: "active-smoothed",
  }),
} as const satisfies PreviewPolicy<SynthRuntimeConfig>);
