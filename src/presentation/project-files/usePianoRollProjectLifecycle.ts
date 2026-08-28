import {
  useCallback,
  useRef,
  type ChangeEvent,
  type RefObject,
} from "react";
import type {
  EditorRuntime,
} from "../../application/editor-session/editor-runtime";
import {
  capturePersistedEditorWorkspace,
} from "../../application/editor-session/workspace-persistence";
import type {
  PersistedEditorWorkspace,
  ProjectRepository,
} from "../../application/ports/project-repository";
import type {
  InstrumentId,
} from "../../domain/identifiers";
import type {
  PianoRollControllerPort,
} from "../../editor-core/interactions/piano-roll-controller-port";
import type {
  MidiImportAnalysis,
} from "../../infrastructure/project-files/midi/midi-import-types";
import type {
  ApplicationDialogState,
  ShowApplicationAlert,
} from "../../application/dialogs/application-dialog-port";
import type {
  ProjectSaveStatus,
} from "../../application/persistence/project-autosave";
import {
  useMidiFileWorkflow,
} from "./useMidiFileWorkflow";
import {
  useProjectAutosave,
} from "./useProjectAutosave";
import {
  useProjectFileWorkflow,
} from "./useProjectFileWorkflow";

export interface PianoRollProjectLifecycle {
  readonly saveStatus: ProjectSaveStatus;
  readonly midiInputRef: RefObject<HTMLInputElement | null>;
  readonly clearPendingMidiImport: () => void;
  readonly closeProject: () => Promise<void>;
  readonly exportProject: () => void;
  readonly openMidiImport: () => void;
  readonly importMidiFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  readonly exportMidi: () => void;
}

export interface UsePianoRollProjectLifecycleOptions {
  readonly runtime: EditorRuntime;
  readonly documentId: string;
  readonly storedRevision: number;
  readonly projectRepository: ProjectRepository;
  readonly selectedInstrumentId: InstrumentId | null;
  readonly controllerRef: RefObject<PianoRollControllerPort | null>;
  readonly stopPlayback: () => void;
  readonly clearClipboard: () => void;
  readonly onSelectionCleared: () => void;
  readonly onWorkspaceRestored: (
    workspace: PersistedEditorWorkspace,
  ) => void;
  readonly showDialog: (dialog: ApplicationDialogState) => void;
  readonly alert: ShowApplicationAlert;
  readonly onCloseProject: () => void | Promise<void>;
}

/** Owns autosave, project replacement and browser file workflows. */
export function usePianoRollProjectLifecycle({
  runtime,
  documentId,
  storedRevision,
  projectRepository,
  selectedInstrumentId,
  controllerRef,
  stopPlayback,
  clearClipboard,
  onSelectionCleared,
  onWorkspaceRestored,
  showDialog,
  alert,
  onCloseProject,
}: UsePianoRollProjectLifecycleOptions): PianoRollProjectLifecycle {
  const pendingMidiImportRef = useRef<MidiImportAnalysis | null>(null);
  const clearPendingMidiImport = useCallback((): void => {
    pendingMidiImportRef.current = null;
  }, []);
  const autosave = useProjectAutosave(
    runtime,
    documentId,
    storedRevision,
    projectRepository,
    selectedInstrumentId,
  );
  const { exportProject, replaceActiveProject } = useProjectFileWorkflow({
    runtime,
    documentId,
    captureWorkspace: () => capturePersistedEditorWorkspace(
      runtime,
      selectedInstrumentId,
    ),
    stopPlayback,
    resetInteraction() {
      controllerRef.current?.cancel();
      controllerRef.current?.clearSelection();
    },
    clearClipboard,
    clearPendingMidiImport,
    onSelectionCleared,
    onWorkspaceRestored,
    alert,
  });
  const midi = useMidiFileWorkflow({
    runtime,
    pendingAnalysisRef: pendingMidiImportRef,
    replaceActiveProject,
    showDialog,
    alert,
  });
  const closeProject = useCallback(async (): Promise<void> => {
    try {
      await autosave.flush();
      await onCloseProject();
    } catch (error: unknown) {
      alert(
        "Project not closed",
        error instanceof Error
          ? `The latest changes could not be saved. ${error.message}`
          : "The latest changes could not be saved.",
        "danger",
      );
    }
  }, [alert, autosave, onCloseProject]);

  return {
    saveStatus: autosave.status,
    midiInputRef: midi.inputRef,
    clearPendingMidiImport,
    closeProject,
    exportProject,
    openMidiImport: midi.openImport,
    importMidiFile: midi.importFile,
    exportMidi: midi.exportFile,
  };
}
