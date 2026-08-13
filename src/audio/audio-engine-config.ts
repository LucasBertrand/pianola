export type AudioLatencyHint = "interactive" | "balanced" | "playback" | number;

export interface AudioEngineConfig {
  readonly latencyHint: AudioLatencyHint;
  readonly schedulerPulseIntervalMs: number;
  readonly scheduleAheadSeconds: number;
  readonly lateEventToleranceSeconds: number;
  readonly latencyCompensationSeconds: number;
  readonly masterGain: number;
  readonly maximumRendererPolyphony: number;
  readonly releaseTailSeconds: number;
}
