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
  audible: boolean;
  cursor: number;
}
