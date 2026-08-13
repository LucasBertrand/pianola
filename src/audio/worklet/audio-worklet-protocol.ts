import type {
  InstrumentId,
  Tick,
} from "../../domain/identifiers";
import type {
  InstrumentConfig,
} from "../../domain/instruments/instrument";
import type {
  TransportState,
} from "../../domain/transport/transport";
import type {
  PlaybackStatus,
  SubtractivePlaybackPresetSnapshot,
} from "../playback-model";

export const PIANOLA_AUDIO_PROCESSOR_NAME = "pianola-audio-engine";

export interface AudioWorkletTimelineInstrument {
  readonly instrumentId: InstrumentId;
  readonly pitches: Uint8Array;
  readonly startTicks: Float64Array;
  readonly durationTicks: Float64Array;
  readonly maximumEndTickTree: Float64Array;
  readonly endTickTreeLeafCount: number;
  readonly gain: number;
  readonly pan: number;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly instrument: SubtractivePlaybackPresetSnapshot;
}

/** Minimum transferable data required by the real-time rendering thread. */
export interface AudioWorkletTimeline {
  readonly ppqn: number;
  readonly durationTicks: Tick;
  readonly masterGain: number;
  readonly masterMuted: boolean;
  readonly masterTuningFrequencyHz: number;
  readonly tempoStartTicks: Float64Array;
  readonly tempoBpms: Float64Array;
  readonly instruments: readonly AudioWorkletTimelineInstrument[];
}

export type MainToAudioWorkletMessage =
  | {
      readonly type: "load-timeline";
      readonly timeline: AudioWorkletTimeline;
      readonly transport: TransportState;
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
      readonly type: "instrument-preview";
      readonly instrumentId: InstrumentId;
      readonly instrument: InstrumentConfig | null;
    }
  | {
      readonly type: "instrument-gain";
      readonly instrumentId: InstrumentId;
      readonly gain: number;
    }
  | {
      readonly type: "master-gain";
      readonly gain: number;
    }
  | {
      readonly type: "audition";
      readonly instrumentId: InstrumentId;
      readonly pitch: number;
      readonly durationSeconds: number;
    };

export type AudioWorkletToMainMessage =
  | {
      readonly type: "transport-state";
      readonly status: PlaybackStatus;
      readonly tick: Tick;
      readonly frame: number;
    }
  | {
      readonly type: "processor-error";
      readonly message: string;
    };
