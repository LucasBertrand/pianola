/** Default audio graph and lookahead scheduler behavior. */
export const AUDIO_CONSTANTS = Object.freeze({
  latencyHint: "interactive",
  schedulerPulseIntervalMs: 25,
  scheduleAheadSeconds: 0.12,
  lateEventToleranceSeconds: 0.035,
  latencyCompensationSeconds: 0.012,
  releaseTailSeconds: 2,
  minimumRestartLeadSeconds: 0.012,
  auditionNoteDurationSeconds: 0.4,
  auditionNoteVelocity: 104,
  fixedNoteEnvelopePeakLevel: 100 / 127,
  minimumNoteSeconds: 0.002,
  cancellationFadeSeconds: 0.006,
  busRampSeconds: 0.008,
  envelopeTimeConstantDivisor: 5,
} as const);
