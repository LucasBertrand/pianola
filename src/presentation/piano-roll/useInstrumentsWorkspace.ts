import { useCallback, type RefObject } from "react";
import type {
  EditorRuntime,
} from "../../application/editor-session/editor-runtime";
import type {
  ShowApplicationAlert,
  ShowApplicationConfirmation,
} from "../../application/dialogs/application-dialog-port";
import type {
  ApplicationDialogState,
} from "../../application/dialogs/application-dialog-port";
import type {
  InstrumentId,
  PresetId,
} from "../../domain/identifiers";
import type {
  InstrumentPreset,
  SubtractiveSynthConfig,
} from "../../domain/instruments/instrument";
import type {
  PianoRollControllerPort,
} from "../../editor-core/interactions/piano-roll-controller-port";
import type {
  UserSettings,
  UserSettingsRepository,
} from "../../application/ports/user-settings-repository";
import {
  useProjectInstrumentWorkflow,
  type ProjectInstrumentWorkflow,
} from "../inspector/instruments/useProjectInstrumentWorkflow";
import {
  usePianoRollUserPreferences,
  type PianoRollUserPreferences,
} from "../inspector/instruments/usePianoRollUserPreferences";
import {
  useInstrumentDialogWorkflow,
  type InstrumentDialogWorkflow,
} from "../inspector/instruments/useInstrumentDialogWorkflow";

export interface InstrumentsWorkspaceOptions {
  readonly runtime: EditorRuntime;
  readonly selectedInstrumentId: InstrumentId | null;
  readonly selectInstrument: (instrumentId: InstrumentId | null) => void;
  readonly pianoRollControllerRef: RefObject<PianoRollControllerPort | null>;
  readonly confirm: ShowApplicationConfirmation;
  readonly alert: ShowApplicationAlert;
  readonly showDialog: (dialog: ApplicationDialogState | null) => void;
  readonly initialUserSettings: UserSettings;
  readonly projectPresetsById: Readonly<Record<PresetId, InstrumentPreset>>;
  readonly projectPresetOrder: readonly PresetId[];
  readonly userSettingsRepository: UserSettingsRepository;
  readonly onUserSettingsChange: (settings: UserSettings) => void;
  readonly previewInstrumentSettings: (
    instrumentId: InstrumentId,
    config: SubtractiveSynthConfig | null,
  ) => void;
}

export interface InstrumentsWorkspaceResult {
  readonly preferences: PianoRollUserPreferences;
  readonly instrumentDialog: InstrumentDialogWorkflow;
  readonly instruments: ProjectInstrumentWorkflow;
}

/**
 * Wires instrument capability, user preferences and instrument dialog for the
 * workspace. The internal routing between these three hooks is encapsulated.
 */
export function useInstrumentsWorkspace({
  runtime,
  selectedInstrumentId,
  selectInstrument,
  pianoRollControllerRef,
  confirm,
  alert,
  showDialog,
  initialUserSettings,
  projectPresetsById,
  projectPresetOrder,
  userSettingsRepository,
  onUserSettingsChange,
  previewInstrumentSettings,
}: InstrumentsWorkspaceOptions): InstrumentsWorkspaceResult {
  const instruments = useProjectInstrumentWorkflow({
    commands: runtime.editorCommands,
    selectedInstrumentId,
    selectInstrument,
    toggleInstrumentSelection(instrumentId) {
      runtime.selectionRequests.toggleInstrument(instrumentId);
    },
    removeInstrumentFromSelection(instrumentId) {
      pianoRollControllerRef.current
        ?.removeInstrumentFromSelection(instrumentId);
    },
    confirm,
  });

  const preferences = usePianoRollUserPreferences({
    runtime,
    settings: initialUserSettings,
    projectPresetsById,
    projectPresetOrder,
    repository: userSettingsRepository,
    onSettingsChange: onUserSettingsChange,
    onPersistenceError(error) {
      alert(
        "Settings not saved",
        error instanceof Error ? error.message : "Unable to save settings.",
        "danger",
      );
    },
    saveProjectPreset: instruments.savePreset,
    removeProjectPreset: instruments.removePreset,
  });

  const dismissApplicationDialog = useCallback((): void => {
    showDialog(null);
  }, [showDialog]);

  const instrumentDialog = useInstrumentDialogWorkflow({
    runtime,
    addInstrument: instruments.add,
    updateInstrument: instruments.update,
    removeInstrument: instruments.remove,
    previewInstrumentSettings,
    presetsById: preferences.presetsById,
    personalPresetIds: preferences.personalPresetIds,
    createPersonalPreset: preferences.createPersonalPreset,
    updatePersonalPreset: preferences.updatePersonalPreset,
    renamePersonalPreset: preferences.renamePersonalPreset,
    deletePersonalPreset: preferences.deletePersonalPreset,
    dismissApplicationDialog,
  });

  return { preferences, instrumentDialog, instruments };
}
