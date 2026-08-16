import {
  type ClipId,
  type NoteId,
  type Tick,
  type InstrumentId,
} from "../domain/identifiers";
import {
  type InstrumentConfig,
  type OscillatorWaveform,
} from "../domain/instruments/instrument";
import {
  type TransportState,
} from "../domain/transport/transport";
import {
  type TimeSignature,
} from "../domain/transport/time-map";

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
 * Discriminated playback instrument variants compiled for the audio worklet.
 * Add a member only when its sample renderer is implemented.
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

/** Immutable project-side input used to build the transferable worklet data. */
export type PlaybackSnapshot = PlaybackPlan;

export type PlaybackStatus = "stopped" | "playing" | "paused";

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
  replaceInstrumentPreview(
    instrumentId: InstrumentId,
    instrument: InstrumentConfig | null,
  ): void;
  play(startTick?: Tick): Promise<void>;
  pause(): void;
  stop(): void;
  seek(tick: Tick): void;
  previewMasterGain(gain: number): void;
  dispose(): Promise<void>;
}
