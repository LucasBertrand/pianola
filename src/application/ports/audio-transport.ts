import type {
  ClipId,
  InstrumentId,
  Tick,
} from "../../domain/identifiers";
import type {
  SynthConfig,
} from "../../domain/instruments/synth/synth-config";
import type {
  LoopRegion,
  TransportState,
} from "../../domain/transport/transport";
import type {
  AudioPlaybackPlan,
  TempoMapSnapshot,
} from "../audio/audio-playback-plan";

export type PlaybackStatus = "stopped" | "playing" | "paused";

export interface PitchAuditionHandle {
  readonly ready: Promise<void>;
  release(): void;
}

export interface InstrumentPreviewPort {
  beginPitchAudition(
    instrumentId: InstrumentId,
    pitch: number,
  ): PitchAuditionHandle;
  previewInstrumentGain(instrumentId: InstrumentId, gain: number): void;
}

export interface AudioTransportController extends InstrumentPreviewPort {
  readonly status: PlaybackStatus;
  getPositionTick(): Tick;
  replacePlaybackState(plan: AudioPlaybackPlan, transport: TransportState): void;
  replaceInstrumentPreview(
    instrumentId: InstrumentId,
    instrument: SynthConfig | null,
  ): void;
  previewTempoMap(clipId: ClipId, tempoMap: TempoMapSnapshot | null): void;
  previewLoop(clipId: ClipId, loop: LoopRegion | null): void;
  play(startTick?: Tick): Promise<void>;
  pause(): void;
  stop(): void;
  seek(tick: Tick): void;
  previewMasterGain(gain: number): void;
  dispose(): Promise<void>;
}
