import type {
  PresetId,
} from "../../identifiers";
import type {
  SynthConfig,
} from "../synth/synth-config";
import type {
  InstrumentPreset,
} from "./instrument-preset";
import {
  cloneInstrumentPreset,
  cloneSynthConfig,
} from "./instrument-preset";

export interface MergedInstrumentPresetLibrary {
  readonly presetsById: Readonly<Record<PresetId, InstrumentPreset>>;
  readonly presetOrder: readonly PresetId[];
}

export function createPersonalInstrumentPreset(
  id: PresetId,
  name: string,
  config: SynthConfig,
): InstrumentPreset {
  return {
    id,
    name: name.trim(),
    kind: "synth",
    config: cloneSynthConfig(config),
  };
}

export { cloneInstrumentPreset, cloneSynthConfig };

/** Personal definitions override stale project snapshots with the same ID. */
export function mergeInstrumentPresetLibraries(
  projectPresetsById: Readonly<Record<PresetId, InstrumentPreset>>,
  projectPresetOrder: readonly PresetId[],
  personalPresetsById: Readonly<Record<PresetId, InstrumentPreset>>,
  personalPresetOrder: readonly PresetId[],
): MergedInstrumentPresetLibrary {
  const presetsById = { ...projectPresetsById, ...personalPresetsById };
  const seen = new Set<PresetId>();
  const presetOrder: PresetId[] = [];

  for (const presetId of [...projectPresetOrder, ...personalPresetOrder]) {
    if (!seen.has(presetId) && presetsById[presetId] !== undefined) {
      seen.add(presetId);
      presetOrder.push(presetId);
    }
  }

  return { presetsById, presetOrder };
}
