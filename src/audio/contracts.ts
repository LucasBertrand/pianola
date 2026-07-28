import type {
  AudioEngineConfig,
  NoteId,
  Tick,
  TimeSignature,
  TransportState,
  VoiceId,
} from "../domain/model";

export interface PackedVoiceEvents {
  readonly voiceId: VoiceId;
  readonly noteIds: readonly NoteId[];
  readonly pitches: Uint8Array;
  readonly velocities: Uint8Array;
  readonly startTicks: Float64Array;
  readonly durationTicks: Float64Array;
}

export interface TempoMapSnapshot {
  readonly startTicks: Float64Array;
  readonly bpms: Float64Array;
  readonly timeSignatures: readonly TimeSignature[];
}

export interface PlaybackSnapshot {
  readonly projectRevision: number;
  readonly ppqn: number;
  readonly tempoMap: TempoMapSnapshot;
  readonly voices: readonly PackedVoiceEvents[];
}

export interface TransportPosition {
  readonly tick: Tick;
  readonly audioTimeSeconds: number;
}

export interface AudioEnginePort {
  readonly context: AudioContext;
  readonly config: AudioEngineConfig;
  configure(config: AudioEngineConfig): void;
  replacePlaybackSnapshot(snapshot: PlaybackSnapshot): void;
  schedule(
    generation: number,
    fromAudioTimeSeconds: number,
    toAudioTimeSeconds: number,
    transport: TransportState,
  ): void;
  start(position: TransportPosition): Promise<void>;
  pause(): void;
  stop(): void;
  seek(tick: Tick): void;
  panic(): void;
  dispose(): Promise<void>;
}

export interface SchedulerClock {
  readonly currentTimeSeconds: number;
  readonly audibleTimeSeconds: number;
}

export interface SchedulerController {
  start(): Promise<void>;
  pause(): void;
  stop(): void;
  seek(tick: Tick): void;
  pulse(): void;
  dispose(): void;
}

export interface PlaybackSnapshotProvider {
  getCurrentSnapshot(): PlaybackSnapshot;
}
