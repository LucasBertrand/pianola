import {
  type AudioEngineConfig,
} from "./audio-engine-config";
import {
  type ClipId,
  type NoteId,
  type Tick,
  type InstrumentId,
} from "../domain/identifiers";
import {
  type OscillatorWaveform,
} from "../domain/instruments/instrument";
import {
  type TimeSignature,
  type TransportState,
} from "../domain/transport/transport";

export interface PackedInstrumentEvents {
  readonly sourceId: ClipId;
  readonly instrumentId: InstrumentId;
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

export interface SubtractivePlaybackPresetSnapshot {
  readonly kind: "subtractive";
  readonly oscillatorWaveform: OscillatorWaveform;
  readonly polyphony: number;
  readonly oscillatorDetuneCents: number;
  readonly pulseWidth: number;
  readonly envelope: PlaybackEnvelope;
  readonly filterCutoffHz: number;
  readonly filterResonance: number;
  readonly filterEnvelopeAmountOctaves: number;
  readonly filterEnvelope: PlaybackEnvelope;
}

export interface PlaybackInstrumentSnapshotBase extends PackedInstrumentEvents {
  readonly gain: number;
  readonly pan: number;
  readonly muted: boolean;
  readonly solo: boolean;
}

/** Immutable audio representation of one subtractive project instrument. */
export interface SubtractivePlaybackInstrumentSnapshot
  extends PlaybackInstrumentSnapshotBase {
  readonly instrument: SubtractivePlaybackPresetSnapshot;
}

/**
 * Discriminated playback instrument variants consumed by the scheduler.
 * Add a new member only when its instrument renderer is implemented.
 */
export type PlaybackInstrumentSnapshot =
  SubtractivePlaybackInstrumentSnapshot;

export interface PlaybackPlan {
  readonly sourceId: ClipId;
  readonly projectRevision: number;
  readonly ppqn: number;
  readonly durationTicks: Tick;
  readonly masterGain: number;
  readonly masterMuted: boolean;
  readonly masterTuningFrequencyHz: number;
  readonly tempoMap: TempoMapSnapshot;
  readonly instruments: readonly PlaybackInstrumentSnapshot[];
}

/** Runtime name retained for scheduler snapshots compiled from a pure plan. */
export type PlaybackSnapshot = PlaybackPlan;

export type PlaybackStatus = "stopped" | "playing" | "paused";

export interface ScheduledNoteEvent<
  TInstrument extends PlaybackInstrumentSnapshot = PlaybackInstrumentSnapshot,
> {
  readonly occurrenceId: string;
  readonly generation: number;
  readonly instrument: TInstrument;
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
  previewInstrumentGain(instrumentId: InstrumentId, gain: number): void;
  cancelScheduledAfter(atAudioTimeSeconds: number): void;
  cancelAll(atAudioTimeSeconds: number): void;
  dispose(): Promise<void>;
}

export interface InstrumentPreviewPort {
  auditionPitch(instrumentId: InstrumentId, pitch: number): Promise<void>;
  previewInstrumentGain(instrumentId: InstrumentId, gain: number): void;
}

export interface AudioTransportController extends InstrumentPreviewPort {
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
  previewMasterGain(gain: number): void;
  pulse(): void;
  dispose(): Promise<void>;
}
