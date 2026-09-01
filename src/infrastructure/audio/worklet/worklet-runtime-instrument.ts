import type {
  SynthRuntimeConfig,
} from "../synth/synth-runtime-config";
import type {
  AudioWorkletTimelineInstrument,
} from "./audio-worklet-protocol";

export interface WorkletRuntimeInstrument {
  timeline: AudioWorkletTimelineInstrument;
  publishedConfig: SynthRuntimeConfig;
  config: SynthRuntimeConfig;
  previewConfig: SynthRuntimeConfig | null;
  gain: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  audible: boolean;
  cursor: number;
}
