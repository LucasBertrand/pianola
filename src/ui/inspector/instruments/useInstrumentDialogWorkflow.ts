import {
  useCallback,
  useState,
} from "react";
import {
  APPLICATION_COLORS,
} from "../../../config/application-colors";
import {
  RENDERING_CONSTANTS,
} from "../../../config/rendering-config";
import type {
  InstrumentId,
  PresetId,
} from "../../../domain/identifiers";
import {
  createInstrumentConfigFromPreset,
  selectInstrumentPresetId,
} from "../../../domain/instrument-presets";
import type {
  InstrumentPreset,
  SubtractiveSynthConfig,
} from "../../../domain/instruments/instrument";
import type {
  EditorRuntime,
} from "../../../editor/runtime/editor-runtime";
import type {
  ProjectInstrumentWorkflow,
} from "./useProjectInstrumentWorkflow";

export interface InstrumentDialogWorkflowOptions {
  readonly runtime: EditorRuntime;
  readonly addInstrument: ProjectInstrumentWorkflow["add"];
  readonly updateInstrument: ProjectInstrumentWorkflow["update"];
  readonly removeInstrument: ProjectInstrumentWorkflow["remove"];
  readonly previewInstrumentSettings: (
    instrumentId: InstrumentId,
    config: SubtractiveSynthConfig | null,
  ) => void;
  readonly dismissApplicationDialog: () => void;
  readonly presetsById: Readonly<Record<PresetId, InstrumentPreset>>;
  readonly personalPresetIds: ReadonlySet<PresetId>;
  readonly createPersonalPreset: (
    name: string,
    config: SubtractiveSynthConfig,
  ) => Promise<InstrumentPreset>;
  readonly updatePersonalPreset: (
    presetId: PresetId,
    config: SubtractiveSynthConfig,
  ) => Promise<InstrumentPreset>;
  readonly renamePersonalPreset: (
    presetId: PresetId,
    name: string,
  ) => Promise<InstrumentPreset>;
  readonly deletePersonalPreset: (presetId: PresetId) => Promise<void>;
}

export interface InstrumentDialogWorkflow {
  readonly open: boolean;
  readonly mode: "create" | "edit";
  readonly selectedPresetId: PresetId | "";
  readonly name: string;
  readonly color: string;
  readonly config: SubtractiveSynthConfig | null;
  readonly openCreate: () => void;
  readonly openEdit: (instrumentId: InstrumentId) => void;
  readonly selectPreset: (presetId: PresetId) => void;
  readonly setName: (name: string) => void;
  readonly setColor: (color: string) => void;
  readonly setConfig: (config: SubtractiveSynthConfig) => void;
  readonly selectedPresetIsPersonal: boolean;
  readonly createPreset: (name: string) => Promise<void>;
  readonly savePreset: () => Promise<void>;
  readonly renamePreset: (name: string) => Promise<void>;
  readonly deletePreset: () => Promise<void>;
  readonly confirm: () => void;
  readonly remove: () => void;
  readonly cancel: () => void;
}

/** Owns the complete draft and validation protocol for instrument editing. */
export function useInstrumentDialogWorkflow({
  runtime,
  addInstrument,
  updateInstrument,
  removeInstrument,
  previewInstrumentSettings,
  dismissApplicationDialog,
  presetsById,
  personalPresetIds,
  createPersonalPreset,
  updatePersonalPreset,
  renamePersonalPreset,
  deletePersonalPreset,
}: InstrumentDialogWorkflowOptions): InstrumentDialogWorkflow {
  const [selectedPresetId, setSelectedPresetId] =
    useState<PresetId | "" | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(
    APPLICATION_COLORS.accent.primary,
  );
  const [config, setConfig] = useState<SubtractiveSynthConfig | null>(null);
  const [editedInstrumentId, setEditedInstrumentId] =
    useState<InstrumentId | null>(null);
  const cancel = useCallback((): void => {
    if (editedInstrumentId !== null) {
      previewInstrumentSettings(editedInstrumentId, null);
    }

    setSelectedPresetId(null);
    setConfig(null);
    setEditedInstrumentId(null);
    setName("");
  }, [editedInstrumentId, previewInstrumentSettings]);
  const openCreate = useCallback((): void => {
    const state = runtime.projectStore.getState();
    const presetId = selectInstrumentPresetId(
      state.instrumentPresetOrder,
      state.instrumentOrder.length,
    );
    const preset = state.instrumentPresetsById[presetId];

    if (preset === undefined) {
      return;
    }

    dismissApplicationDialog();
    setName(`Instrument ${state.instrumentOrder.length + 1}`);
    setColor(
      RENDERING_CONSTANTS.userInstrumentColors[
        state.instrumentOrder.length
        % RENDERING_CONSTANTS.userInstrumentColors.length
      ] ?? APPLICATION_COLORS.accent.primary,
    );
    setEditedInstrumentId(null);
    setConfig(createInstrumentConfigFromPreset(preset));
    setSelectedPresetId(presetId);
  }, [dismissApplicationDialog, runtime]);
  const openEdit = useCallback((instrumentId: InstrumentId): void => {
    const projectInstrument =
      runtime.projectStore.getState().projectInstrumentsById[instrumentId];

    if (
      projectInstrument === undefined
      || projectInstrument.instrument.kind !== "subtractive"
    ) {
      return;
    }

    dismissApplicationDialog();
    setEditedInstrumentId(instrumentId);
    setName(projectInstrument.name);
    setColor(projectInstrument.color);
    setConfig({
      ...projectInstrument.instrument,
      envelope: { ...projectInstrument.instrument.envelope },
      filterEnvelope: { ...projectInstrument.instrument.filterEnvelope },
    });
    setSelectedPresetId("");
  }, [dismissApplicationDialog, runtime]);
  const selectPreset = useCallback((presetId: PresetId): void => {
    const preset = presetsById[presetId];

    if (preset !== undefined) {
      const nextConfig = createInstrumentConfigFromPreset(preset);

      setSelectedPresetId(presetId);
      setConfig(nextConfig);

      if (editedInstrumentId !== null) {
        previewInstrumentSettings(editedInstrumentId, nextConfig);
      }
    }
  }, [editedInstrumentId, presetsById, previewInstrumentSettings]);
  const updateConfig = useCallback((
    nextConfig: SubtractiveSynthConfig,
  ): void => {
    setConfig(nextConfig);

    if (editedInstrumentId !== null) {
      previewInstrumentSettings(editedInstrumentId, nextConfig);
    }
  }, [editedInstrumentId, previewInstrumentSettings]);
  const confirm = useCallback((): void => {
    if (
      selectedPresetId === null
      || config === null
      || name.trim().length === 0
    ) {
      return;
    }

    if (editedInstrumentId === null) {
      addInstrument(
        name,
        config,
        color,
        selectedPresetId !== "" && personalPresetIds.has(selectedPresetId)
          ? presetsById[selectedPresetId]
          : undefined,
      );
    } else {
      updateInstrument(
        editedInstrumentId,
        {
          name: name.trim(),
          color,
          instrument: config,
        },
        "Update instrument settings",
        selectedPresetId !== "" && personalPresetIds.has(selectedPresetId)
          ? presetsById[selectedPresetId]
          : undefined,
      );
    }

    cancel();
  }, [
    addInstrument,
    cancel,
    color,
    config,
    editedInstrumentId,
    name,
    personalPresetIds,
    presetsById,
    selectedPresetId,
    updateInstrument,
  ]);
  const createPreset = useCallback(async (presetName: string): Promise<void> => {
    if (config === null) {
      return;
    }

    const preset = await createPersonalPreset(presetName, config);

    setSelectedPresetId(preset.id);
    setConfig(createInstrumentConfigFromPreset(preset));
  }, [config, createPersonalPreset]);
  const savePreset = useCallback(async (): Promise<void> => {
    if (
      config === null
      || selectedPresetId === null
      || selectedPresetId === ""
      || !personalPresetIds.has(selectedPresetId)
    ) {
      return;
    }

    const preset = await updatePersonalPreset(selectedPresetId, config);

    setConfig(createInstrumentConfigFromPreset(preset));
  }, [config, personalPresetIds, selectedPresetId, updatePersonalPreset]);
  const renamePreset = useCallback(async (presetName: string): Promise<void> => {
    if (
      selectedPresetId === null
      || selectedPresetId === ""
      || !personalPresetIds.has(selectedPresetId)
    ) {
      return;
    }

    await renamePersonalPreset(selectedPresetId, presetName);
  }, [personalPresetIds, renamePersonalPreset, selectedPresetId]);
  const deletePreset = useCallback(async (): Promise<void> => {
    if (
      selectedPresetId === null
      || selectedPresetId === ""
      || !personalPresetIds.has(selectedPresetId)
    ) {
      return;
    }

    await deletePersonalPreset(selectedPresetId);
    setSelectedPresetId("");
  }, [deletePersonalPreset, personalPresetIds, selectedPresetId]);
  const remove = useCallback((): void => {
    if (editedInstrumentId !== null) {
      removeInstrument(editedInstrumentId);
      cancel();
    }
  }, [editedInstrumentId, removeInstrument, cancel]);

  return {
    open: selectedPresetId !== null && config !== null,
    mode: editedInstrumentId === null ? "create" : "edit",
    selectedPresetId: selectedPresetId ?? "",
    name,
    color,
    config,
    openCreate,
    openEdit,
    selectPreset,
    setName,
    setColor,
    setConfig: updateConfig,
    selectedPresetIsPersonal:
      selectedPresetId !== null
      && selectedPresetId !== ""
      && personalPresetIds.has(selectedPresetId),
    createPreset,
    savePreset,
    renamePreset,
    deletePreset,
    confirm,
    remove,
    cancel,
  };
}
