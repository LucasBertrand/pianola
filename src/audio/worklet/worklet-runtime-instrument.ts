import type {
  SubtractivePlaybackPresetSnapshot,
} from "../playback-model";
import type {
  AudioWorkletTimelineInstrument,
} from "./audio-worklet-protocol";

export interface WorkletRuntimeInstrument {
  timeline: AudioWorkletTimelineInstrument;
  publishedConfig: SubtractivePlaybackPresetSnapshot;
  config: SubtractivePlaybackPresetSnapshot;
  previewConfig: SubtractivePlaybackPresetSnapshot | null;
  gain: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  audible: boolean;
  cursor: number;
}
