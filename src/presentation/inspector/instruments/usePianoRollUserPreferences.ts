import {
  useCallback,
  useMemo,
  useState,
} from "react";
import type {
  EditorRuntime,
} from "../../../application/editor-session/editor-runtime";
import type {
  UserSettings,
  UserSettingsRepository,
} from "../../../application/ports/user-settings-repository";
import type {
  PresetId,
} from "../../../domain/identifiers";
import type {
  InstrumentPreset,
} from "../../../domain/instruments/presets/instrument-preset";
import type {
  SynthConfig,
} from "../../../domain/instruments/synth/synth-config";
import {
  mergeInstrumentPresetLibraries,
} from "../../../domain/instruments/presets/personal-preset-library";
import type {
  SelectionMode,
} from "../../../editor-core/interactions/gestures/gesture-draft";
import type {
  NoteColorMode,
} from "../../../editor-core/model/note-color-mode";
import type {
  NoteLabelMode,
} from "../../../editor-core/model/note-label-mode";
import {
  addPersonalInstrumentPreset,
  deletePersonalInstrumentPreset,
  renamePersonalInstrumentPreset,
  updatePersonalInstrumentPreset,
} from "./personal-instrument-preset-settings";

export interface PianoRollUserPreferences {
  readonly selectionMode: SelectionMode;
  readonly noteColorMode: NoteColorMode;
  readonly noteLabelMode: NoteLabelMode;
  readonly pitchPreviewEnabled: boolean;
  readonly presetsById: Readonly<Record<PresetId, InstrumentPreset>>;
  readonly presetOrder: readonly PresetId[];
  readonly personalPresetIds: ReadonlySet<PresetId>;
  readonly changeSelectionMode: (mode: SelectionMode) => void;
  readonly toggleNoteColorMode: () => void;
  readonly changeNoteLabelMode: (mode: NoteLabelMode) => void;
  readonly togglePitchPreview: () => void;
  readonly createPersonalPreset: (
    name: string,
    config: SynthConfig,
  ) => Promise<InstrumentPreset>;
  readonly updatePersonalPreset: (
    presetId: PresetId,
    config: SynthConfig,
  ) => Promise<InstrumentPreset>;
  readonly renamePersonalPreset: (
    presetId: PresetId,
    name: string,
  ) => Promise<InstrumentPreset>;
  readonly deletePersonalPreset: (presetId: PresetId) => Promise<void>;
}

export interface UsePianoRollUserPreferencesOptions {
  readonly runtime: EditorRuntime;
  readonly settings: UserSettings;
  readonly projectPresetsById: Readonly<Record<PresetId, InstrumentPreset>>;
  readonly projectPresetOrder: readonly PresetId[];
  readonly repository: UserSettingsRepository;
  readonly createPersonalPresetId: () => PresetId;
  readonly onSettingsChange: (settings: UserSettings) => void;
  readonly onPersistenceError: (error: unknown) => void;
  readonly saveProjectPreset: (
    preset: InstrumentPreset,
    label: string,
  ) => void;
  readonly removeProjectPreset: (presetId: PresetId, label: string) => void;
}

/** Owns temporary preference state and personal-preset persistence. */
export function usePianoRollUserPreferences({
  runtime,
  settings,
  projectPresetsById,
  projectPresetOrder,
  repository,
  createPersonalPresetId,
  onSettingsChange,
  onPersistenceError,
  saveProjectPreset,
  removeProjectPreset,
}: UsePianoRollUserPreferencesOptions): PianoRollUserPreferences {
  const [selectionMode, setSelectionMode] =
    useState<SelectionMode>(settings.selectionMode);
  const [noteColorMode, setNoteColorMode] =
    useState<NoteColorMode>(settings.noteColorMode);
  const [noteLabelMode, setNoteLabelMode] =
    useState<NoteLabelMode>(settings.noteLabelMode);
  const [pitchPreviewEnabled, setPitchPreviewEnabled] =
    useState(settings.pitchPreviewEnabled);
  const mergedPresets = useMemo(() => mergeInstrumentPresetLibraries(
    projectPresetsById,
    projectPresetOrder,
    settings.personalInstrumentPresetsById,
    settings.personalInstrumentPresetOrder,
  ), [
    projectPresetOrder,
    projectPresetsById,
    settings.personalInstrumentPresetOrder,
    settings.personalInstrumentPresetsById,
  ]);
  const personalPresetIds = useMemo(
    () => new Set(settings.personalInstrumentPresetOrder),
    [settings.personalInstrumentPresetOrder],
  );
  const persistPreference = useCallback((
    transform: (current: UserSettings) => UserSettings,
  ): void => {
    void repository.update(transform)
      .then(onSettingsChange)
      .catch(onPersistenceError);
  }, [onPersistenceError, onSettingsChange, repository]);
  const changeSelectionMode = useCallback((mode: SelectionMode): void => {
    setSelectionMode(mode);
    persistPreference((current) => ({ ...current, selectionMode: mode }));
  }, [persistPreference]);
  const toggleNoteColorMode = useCallback((): void => {
    setNoteColorMode((currentMode) => {
      const nextMode: NoteColorMode =
        currentMode === "instrument" ? "pitch" : "instrument";
      runtime.noteColorMode.set(nextMode);
      persistPreference((current) => ({
        ...current,
        noteColorMode: nextMode,
      }));
      return nextMode;
    });
  }, [persistPreference, runtime]);
  const changeNoteLabelMode = useCallback((mode: NoteLabelMode): void => {
    setNoteLabelMode(mode);
    runtime.noteLabelMode.set(mode);
    persistPreference((current) => ({
      ...current,
      noteLabelMode: mode,
    }));
  }, [persistPreference, runtime]);
  const togglePitchPreview = useCallback((): void => {
    setPitchPreviewEnabled((enabled) => {
      const nextEnabled = !enabled;
      persistPreference((current) => ({
        ...current,
        pitchPreviewEnabled: nextEnabled,
      }));
      return nextEnabled;
    });
  }, [persistPreference]);
  const createPersonalPreset = useCallback(async (
    name: string,
    config: SynthConfig,
  ): Promise<InstrumentPreset> => {
    let preset: InstrumentPreset | undefined;
    const updatedSettings = await repository.update((current) => {
      const result = addPersonalInstrumentPreset(
        current,
        createPersonalPresetId(),
        name,
        config,
      );
      preset = result.preset;
      return result.settings;
    });
    onSettingsChange(updatedSettings);

    if (preset === undefined) {
      throw new Error("The created preset could not be loaded.");
    }

    return preset;
  }, [createPersonalPresetId, onSettingsChange, repository]);
  const updatePersonalPreset = useCallback(async (
    presetId: PresetId,
    config: SynthConfig,
  ): Promise<InstrumentPreset> => {
    let preset: InstrumentPreset | undefined;
    const updatedSettings = await repository.update((current) => {
      const result = updatePersonalInstrumentPreset(current, presetId, config);
      preset = result.preset;
      return result.settings;
    });
    onSettingsChange(updatedSettings);

    if (preset === undefined) {
      throw new Error("The updated preset could not be loaded.");
    }

    if (runtime.projectStore.getState().instrumentPresetsById[presetId]) {
      saveProjectPreset(preset, "Update instrument preset");
    }

    return preset;
  }, [onSettingsChange, repository, runtime, saveProjectPreset]);
  const renamePersonalPreset = useCallback(async (
    presetId: PresetId,
    name: string,
  ): Promise<InstrumentPreset> => {
    let preset: InstrumentPreset | undefined;
    const updatedSettings = await repository.update((current) => {
      const result = renamePersonalInstrumentPreset(current, presetId, name);
      preset = result.preset;
      return result.settings;
    });
    onSettingsChange(updatedSettings);

    if (preset === undefined) {
      throw new Error("The renamed preset could not be loaded.");
    }

    if (runtime.projectStore.getState().instrumentPresetsById[presetId]) {
      saveProjectPreset(preset, "Rename instrument preset");
    }

    return preset;
  }, [onSettingsChange, repository, runtime, saveProjectPreset]);
  const deletePersonalPreset = useCallback(async (
    presetId: PresetId,
  ): Promise<void> => {
    const updatedSettings = await repository.update((current) =>
      deletePersonalInstrumentPreset(current, presetId));
    onSettingsChange(updatedSettings);
    removeProjectPreset(presetId, "Delete instrument preset");
  }, [onSettingsChange, removeProjectPreset, repository]);

  return {
    selectionMode,
    noteColorMode,
    noteLabelMode,
    pitchPreviewEnabled,
    presetsById: mergedPresets.presetsById,
    presetOrder: mergedPresets.presetOrder,
    personalPresetIds,
    changeSelectionMode,
    toggleNoteColorMode,
    changeNoteLabelMode,
    togglePitchPreview,
    createPersonalPreset,
    updatePersonalPreset,
    renamePersonalPreset,
    deletePersonalPreset,
  };
}
