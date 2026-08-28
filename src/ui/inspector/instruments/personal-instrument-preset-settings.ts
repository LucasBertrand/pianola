import type {
  UserSettings,
} from "../../../application/ports/user-settings-repository";
import {
  MAXIMUM_INSTRUMENT_NAME_LENGTH,
  MAXIMUM_PROJECT_INSTRUMENT_COUNT,
  type InstrumentPreset,
  type SubtractiveSynthConfig,
} from "../../../domain/instruments/instrument";
import type {
  PresetId,
} from "../../../domain/identifiers";
import {
  createPersonalInstrumentPreset,
} from "../../../domain/personal-instrument-presets";

export function addPersonalInstrumentPreset(
  settings: UserSettings,
  presetId: PresetId,
  presetName: string,
  config: SubtractiveSynthConfig,
): { readonly settings: UserSettings; readonly preset: InstrumentPreset } {
  const normalizedName = validatePersonalPresetName(presetName);
  assertPersonalPresetNameAvailable(settings, normalizedName);

  if (
    settings.personalInstrumentPresetOrder.length
    >= MAXIMUM_PROJECT_INSTRUMENT_COUNT
  ) {
    throw new Error("The personal preset library is full.");
  }

  const preset = createPersonalInstrumentPreset(
    presetId,
    normalizedName,
    config,
  );

  return {
    preset,
    settings: {
      ...settings,
      personalInstrumentPresetsById: {
        ...settings.personalInstrumentPresetsById,
        [preset.id]: preset,
      },
      personalInstrumentPresetOrder: [
        ...settings.personalInstrumentPresetOrder,
        preset.id,
      ],
    },
  };
}

export function updatePersonalInstrumentPreset(
  settings: UserSettings,
  presetId: PresetId,
  config: SubtractiveSynthConfig,
): { readonly settings: UserSettings; readonly preset: InstrumentPreset } {
  const currentPreset = getPersonalInstrumentPreset(settings, presetId);
  const preset = createPersonalInstrumentPreset(
    presetId,
    currentPreset.name,
    config,
  );

  return {
    preset,
    settings: {
      ...settings,
      personalInstrumentPresetsById: {
        ...settings.personalInstrumentPresetsById,
        [presetId]: preset,
      },
    },
  };
}

export function renamePersonalInstrumentPreset(
  settings: UserSettings,
  presetId: PresetId,
  presetName: string,
): { readonly settings: UserSettings; readonly preset: InstrumentPreset } {
  const currentPreset = getPersonalInstrumentPreset(settings, presetId);
  const normalizedName = validatePersonalPresetName(presetName);
  assertPersonalPresetNameAvailable(settings, normalizedName, presetId);
  const preset = { ...currentPreset, name: normalizedName };

  return {
    preset,
    settings: {
      ...settings,
      personalInstrumentPresetsById: {
        ...settings.personalInstrumentPresetsById,
        [presetId]: preset,
      },
    },
  };
}

export function deletePersonalInstrumentPreset(
  settings: UserSettings,
  presetId: PresetId,
): UserSettings {
  getPersonalInstrumentPreset(settings, presetId);

  return {
    ...settings,
    personalInstrumentPresetsById: Object.fromEntries(
      Object.entries(settings.personalInstrumentPresetsById).filter(
        ([candidateId]) => candidateId !== presetId,
      ),
    ),
    personalInstrumentPresetOrder:
      settings.personalInstrumentPresetOrder.filter(
        (candidateId) => candidateId !== presetId,
      ),
  };
}

export function validatePersonalPresetName(name: string): string {
  const normalizedName = name.trim();

  if (
    normalizedName.length === 0
    || normalizedName.length > MAXIMUM_INSTRUMENT_NAME_LENGTH
  ) {
    throw new Error(
      `Preset names must contain between 1 and ${MAXIMUM_INSTRUMENT_NAME_LENGTH} characters.`,
    );
  }

  return normalizedName;
}

function getPersonalInstrumentPreset(
  settings: UserSettings,
  presetId: PresetId,
): InstrumentPreset {
  const preset = settings.personalInstrumentPresetsById[presetId];

  if (preset === undefined) {
    throw new Error("This personal preset no longer exists.");
  }

  return preset;
}

function assertPersonalPresetNameAvailable(
  settings: UserSettings,
  name: string,
  ignoredPresetId?: PresetId,
): void {
  const normalizedName = name.toLocaleLowerCase();
  const duplicate = settings.personalInstrumentPresetOrder.some((presetId) => (
    presetId !== ignoredPresetId
    && settings.personalInstrumentPresetsById[presetId]?.name
      .toLocaleLowerCase() === normalizedName
  ));

  if (duplicate) {
    throw new Error(`A personal preset named "${name}" already exists.`);
  }
}
