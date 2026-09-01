import type {
  PresetId,
} from "../../identifiers";
import type {
  SynthConfig,
} from "../synth/synth-config";

export interface SynthPreset {
  readonly id: PresetId;
  readonly name: string;
  readonly kind: "synth";
  readonly config: SynthConfig;
}

/** A named, reusable sound definition shared by every clip. */
export type InstrumentPreset = SynthPreset;

export function cloneSynthConfig(config: SynthConfig): SynthConfig {
  return {
    ...config,
    envelope: { ...config.envelope },
    filterEnvelope: { ...config.filterEnvelope },
  };
}

export function cloneInstrumentPreset(
  preset: InstrumentPreset,
): InstrumentPreset {
  return {
    ...preset,
    config: cloneSynthConfig(preset.config),
  };
}
