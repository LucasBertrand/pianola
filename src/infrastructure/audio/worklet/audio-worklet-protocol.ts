import type {
  ClipId,
  InstrumentId,
  NoteId,
  Tick,
} from "../../../domain/identifiers";
import type {
  LoopRegion,
  TransportState,
} from "../../../domain/transport/transport";
import type {
  PlaybackStatus,
} from "../../../application/ports/audio-transport";
import type {
  SynthRuntimeConfig,
} from "../synth/synth-runtime-config";
import type {
  MasterLevelMeasurement,
} from "./worklet-master-stage";

export const PLAYBACK_PROCESSOR_NAME = "playback-processor";
export const AUDIO_WORKLET_PROTOCOL_VERSION = 3 as const;

interface VersionedMessage {
  readonly protocolVersion: typeof AUDIO_WORKLET_PROTOCOL_VERSION;
}

export interface AudioWorkletTimelineInstrument {
  readonly instrumentId: InstrumentId;
  readonly noteIds: readonly NoteId[];
  readonly pitches: Uint8Array;
  readonly startTicks: Float64Array;
  readonly durationTicks: Float64Array;
  readonly maximumEndTickTree: Float64Array;
  readonly endTickTreeLeafCount: number;
  readonly gain: number;
  readonly pan: number;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly instrument: SynthRuntimeConfig;
}

/** Minimum transferable data required by the real-time rendering thread. */
export interface AudioWorkletTimeline {
  readonly sourceId: ClipId;
  readonly ppqn: number;
  readonly durationTicks: Tick;
  readonly masterGain: number;
  readonly masterMuted: boolean;
  readonly masterTuningFrequencyHz: number;
  readonly tempoStartTicks: Float64Array;
  readonly tempoBpms: Float64Array;
  readonly instruments: readonly AudioWorkletTimelineInstrument[];
}

export type MainToAudioWorkletMessage = VersionedMessage & (
  | {
      readonly type: "load-timeline";
      readonly timeline: AudioWorkletTimeline;
      readonly transport: TransportState;
      readonly sequence: number;
      readonly stateVersion: number;
    }
  | {
      readonly type: "queue-timeline";
      readonly timeline: AudioWorkletTimeline;
      readonly transport: TransportState;
      readonly sequence: number;
      readonly stateVersion: number;
      readonly operation: number;
    }
  | {
      readonly type: "clear-queued-timeline";
      readonly operation: number;
    }
  | {
      readonly type: "replace-instrument-events";
      readonly instrumentId: InstrumentId;
      readonly noteIds: readonly NoteId[];
      readonly pitches: Uint8Array;
      readonly startTicks: Float64Array;
      readonly durationTicks: Float64Array;
      readonly maximumEndTickTree: Float64Array;
      readonly endTickTreeLeafCount: number;
      readonly sequence: number;
      readonly stateVersion: number;
    }
  | {
      readonly type: "transport-config";
      readonly transport: TransportState;
      readonly ppqn: number;
      readonly durationTicks: Tick;
      readonly tempoStartTicks: Float64Array;
      readonly tempoBpms: Float64Array;
      readonly sequence: number;
      readonly stateVersion: number;
    }
  | {
      readonly type: "play";
      readonly tick: Tick;
    }
  | { readonly type: "pause" }
  | { readonly type: "stop" }
  | {
      readonly type: "seek";
      readonly tick: Tick;
    }
  | {
      readonly type: "tempo-map-preview";
      readonly sourceId: ClipId;
      readonly sequence: number;
      readonly previewVersion: number;
      readonly tempoStartTicks: Float64Array | null;
      readonly tempoBpms: Float64Array | null;
    }
  | {
      readonly type: "loop-preview";
      readonly sourceId: ClipId;
      readonly sequence: number;
      readonly previewVersion: number;
      readonly loop: LoopRegion | null;
    }
  | {
      readonly type: "instrument-preview";
      readonly instrumentId: InstrumentId;
      readonly instrument: SynthRuntimeConfig | null;
    }
  | {
      readonly type: "instrument-config";
      readonly instrumentId: InstrumentId;
      readonly instrument: SynthRuntimeConfig;
      readonly sequence: number;
      readonly stateVersion: number;
    }
  | {
      readonly type: "instrument-gain";
      readonly instrumentId: InstrumentId;
      readonly gain: number;
      readonly sequence?: number;
      readonly stateVersion?: number;
    }
  | {
      readonly type: "instrument-pan";
      readonly instrumentId: InstrumentId;
      readonly pan: number;
      readonly sequence: number;
      readonly stateVersion: number;
    }
  | {
      readonly type: "instrument-mute";
      readonly instrumentId: InstrumentId;
      readonly muted: boolean;
      readonly sequence: number;
      readonly stateVersion: number;
    }
  | {
      readonly type: "instrument-solo";
      readonly instrumentId: InstrumentId;
      readonly solo: boolean;
      readonly sequence: number;
      readonly stateVersion: number;
    }
  | {
      readonly type: "master-gain";
      readonly gain: number;
      readonly sequence?: number;
      readonly stateVersion?: number;
    }
  | {
      readonly type: "master-mute";
      readonly muted: boolean;
      readonly sequence: number;
      readonly stateVersion: number;
    }
  | {
      readonly type: "master-tuning";
      readonly tuningFrequencyHz: number;
      readonly sequence: number;
      readonly stateVersion: number;
    }
  | {
      readonly type: "audition-start";
      readonly auditionId: number;
      readonly instrumentId: InstrumentId;
      readonly pitch: number;
    }
  | {
      readonly type: "audition-release";
      readonly auditionId: number;
    });

export type AudioWorkletToMainMessage = VersionedMessage & (
  | {
      readonly type: "transport-state";
      readonly status: PlaybackStatus;
      readonly sourceId: ClipId;
      readonly tick: Tick;
      readonly frame: number;
      readonly sequence: number;
    }
  | {
      readonly type: "master-levels";
      readonly frame: number;
      readonly levels: MasterLevelMeasurement;
    }
  | {
      readonly type: "processor-error";
      readonly message: string;
    }
  | {
      readonly type: "queued-timeline-state";
      readonly operation: number;
      readonly sequence: number | null;
    });
