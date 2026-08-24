import type {
  PresetId,
} from "./identifiers";
import type {
  InstrumentPreset,
  SubtractiveSynthConfig,
} from "./instruments/instrument";

export interface MergedInstrumentPresetLibrary {
  readonly presetsById: Readonly<Record<PresetId, InstrumentPreset>>;
  readonly presetOrder: readonly PresetId[];
}

export function createPersonalInstrumentPresetId(): PresetId {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `personal-preset-${globalThis.crypto.randomUUID()}`;
  }

  return `personal-preset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createPersonalInstrumentPreset(
  id: PresetId,
  name: string,
  config: SubtractiveSynthConfig,
): InstrumentPreset {
  return {
    id,
    name: name.trim(),
    kind: "subtractive",
    config: cloneSubtractiveSynthConfig(config),
  };
}

export function cloneInstrumentPreset(
  preset: InstrumentPreset,
): InstrumentPreset {
  return {
    ...preset,
    config: cloneSubtractiveSynthConfig(preset.config),
  };
}

export function cloneSubtractiveSynthConfig(
  config: SubtractiveSynthConfig,
): SubtractiveSynthConfig {
  return {
    ...config,
    envelope: { ...config.envelope },
    filterEnvelope: { ...config.filterEnvelope },
  };
}

/** Personal definitions override stale project snapshots with the same ID. */
export function mergeInstrumentPresetLibraries(
  projectPresetsById: Readonly<Record<PresetId, InstrumentPreset>>,
  projectPresetOrder: readonly PresetId[],
  personalPresetsById: Readonly<Record<PresetId, InstrumentPreset>>,
  personalPresetOrder: readonly PresetId[],
): MergedInstrumentPresetLibrary {
  const presetsById = {
    ...projectPresetsById,
    ...personalPresetsById,
  };
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
