import type {
  SynthPlaybackPresetSnapshot,
} from "../playback-model";
import type {
  AudioWorkletTimelineInstrument,
} from "./audio-worklet-protocol";

export interface WorkletRuntimeInstrument {
  timeline: AudioWorkletTimelineInstrument;
  publishedConfig: SynthPlaybackPresetSnapshot;
  config: SynthPlaybackPresetSnapshot;
  previewConfig: SynthPlaybackPresetSnapshot | null;
  gain: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  audible: boolean;
  cursor: number;
}
