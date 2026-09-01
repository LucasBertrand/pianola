import {
  type ClipId,
  type NoteId,
  type Tick,
  type InstrumentId,
} from "../../domain/identifiers";
import type {
  SynthConfig,
} from "../../domain/instruments/synth/synth-config";
import {
  type TimeSignature,
} from "../../domain/transport/time-map";

export interface PackedInstrumentEvents {
  readonly sourceId: ClipId;
  readonly instrumentId: InstrumentId;
  readonly noteIds: readonly NoteId[];
  readonly pitches: Uint8Array;
  /** Preserved musical data; velocity is not yet consumed by the synth renderer. */
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

export interface AudioPlaybackInstrumentPlanBase extends PackedInstrumentEvents {
  readonly gain: number;
  readonly pan: number;
  readonly muted: boolean;
  readonly solo: boolean;
}

/** Immutable audio representation of one synth project instrument. */
export interface SynthAudioPlaybackInstrumentPlan
  extends AudioPlaybackInstrumentPlanBase {
  /** Durable configuration; infrastructure projects it once into a runtime DTO. */
  readonly instrument: SynthConfig;
}

/**
 * Discriminated playback instrument variants compiled for the audio worklet.
 * Add a member only when its sample renderer is implemented.
 */
export type AudioPlaybackInstrumentPlan = SynthAudioPlaybackInstrumentPlan;

export interface AudioPlaybackPlan {
  readonly sourceId: ClipId;
  readonly projectRevision: number;
  readonly ppqn: number;
  readonly durationTicks: Tick;
  readonly masterGain: number;
  readonly masterMuted: boolean;
  readonly masterTuningFrequencyHz: number;
  readonly tempoMap: TempoMapSnapshot;
  readonly instruments: readonly AudioPlaybackInstrumentPlan[];
}
