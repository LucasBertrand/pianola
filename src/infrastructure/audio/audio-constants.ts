/** Browser-facing audio defaults; real-time timing lives in AudioWorklet. */
export const AUDIO_CONSTANTS = Object.freeze({
  latencyHint: "interactive",
  fixedNoteEnvelopePeakLevel: 100 / 127,
} as const);
