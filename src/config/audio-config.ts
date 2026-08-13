/** Browser-facing audio defaults; real-time timing lives in AudioWorklet. */
export const AUDIO_CONSTANTS = Object.freeze({
  latencyHint: "interactive",
  auditionNoteDurationSeconds: 0.4,
  fixedNoteEnvelopePeakLevel: 100 / 127,
} as const);
