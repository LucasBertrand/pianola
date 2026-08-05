import type {
  AudioEngineConfig,
  NoteId,
  OscillatorWaveform,
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
  readonly startSeconds: Float64Array;
  readonly bpms: Float64Array;
  readonly timeSignatures: readonly TimeSignature[];
}

export interface PlaybackEnvelope {
  readonly attackSeconds: number;
  readonly decaySeconds: number;
  readonly sustainLevel: number;
  readonly releaseSeconds: number;
}

export interface SubtractivePlaybackInstrument {
  readonly kind: "subtractive";
  readonly oscillatorWaveform: OscillatorWaveform;
  readonly polyphony: number;
  readonly oscillatorDetuneCents: number;
  readonly envelope: PlaybackEnvelope;
  readonly filterCutoffHz: number;
  readonly filterResonance: number;
}

export interface PlaybackVoiceSnapshot extends PackedVoiceEvents {
  readonly gain: number;
  readonly pan: number;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly instrument: SubtractivePlaybackInstrument;
}

export interface PlaybackSnapshot {
  readonly projectRevision: number;
  readonly ppqn: number;
  readonly durationTicks: Tick;
  readonly masterGain: number;
  readonly masterMuted: boolean;
  readonly masterTuningFrequencyHz: number;
  readonly tempoMap: TempoMapSnapshot;
  readonly voices: readonly PlaybackVoiceSnapshot[];
}

export type PlaybackStatus = "stopped" | "playing" | "paused";

export interface ScheduledNoteEvent {
  readonly occurrenceId: string;
  readonly generation: number;
  readonly voice: PlaybackVoiceSnapshot;
  readonly pitch: number;
  readonly velocity: number;
  readonly startAudioTimeSeconds: number;
  readonly endAudioTimeSeconds: number;
}

export interface AudioEnginePort {
  readonly config: AudioEngineConfig;
  readonly currentTimeSeconds: number;
  configure(config: AudioEngineConfig): void;
  replacePlaybackSnapshot(snapshot: PlaybackSnapshot): void;
  resume(): Promise<void>;
  scheduleNote(event: ScheduledNoteEvent): void;
  previewVoiceGain(voiceId: VoiceId, gain: number): void;
  cancelScheduledAfter(atAudioTimeSeconds: number): void;
  cancelAll(atAudioTimeSeconds: number): void;
  dispose(): Promise<void>;
}

export interface AudioTransportController {
  readonly status: PlaybackStatus;
  getPositionTick(): Tick;
  replacePlaybackState(
    snapshot: PlaybackSnapshot,
    transport: TransportState,
  ): void;
  play(startTick?: Tick): Promise<void>;
  pause(): void;
  stop(): void;
  seek(tick: Tick): void;
  auditionPitch(voiceId: VoiceId, pitch: number): Promise<void>;
  previewVoiceGain(voiceId: VoiceId, gain: number): void;
  previewMasterGain(gain: number): void;
  pulse(): void;
  dispose(): Promise<void>;
}
