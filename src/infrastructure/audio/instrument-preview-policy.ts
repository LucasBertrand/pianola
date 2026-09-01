export type InstrumentParameterPreviewBehavior =
  | "active-smoothed"
  | "next-note"
  | "processor-restart";

/**
 * Canonical behavior of every real-time synth parameter.
 * Keep the dialog, transport and worklet implementations aligned with this
 * matrix instead of deciding preview semantics at individual call sites.
 */
export const INSTRUMENT_PARAMETER_PREVIEW_POLICY = Object.freeze({
  "masterTuningFrequencyHz": "active-smoothed",
  "kind": "processor-restart",
  "oscillatorWaveform": "next-note",
  "polyphony": "next-note",
  "oscillatorDetuneCents": "active-smoothed",
  "oscillatorFreePhase": "next-note",
  "pulseWidth": "active-smoothed",
  "envelope.attackSeconds": "next-note",
  "envelope.decaySeconds": "next-note",
  "envelope.sustainLevel": "active-smoothed",
  "envelope.releaseSeconds": "next-note",
  "envelope.curve": "active-smoothed",
  "filterCutoffHz": "active-smoothed",
  "filterResonance": "active-smoothed",
  "filterKeyTracking": "active-smoothed",
  "filterEnvelopeAmountOctaves": "active-smoothed",
  "filterEnvelope.attackSeconds": "next-note",
  "filterEnvelope.decaySeconds": "next-note",
  "filterEnvelope.sustainLevel": "active-smoothed",
  "filterEnvelope.releaseSeconds": "next-note",
  "filterEnvelope.curve": "active-smoothed",
} as const satisfies Readonly<Record<
  string,
  InstrumentParameterPreviewBehavior
>>);
