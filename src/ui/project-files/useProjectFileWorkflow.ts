import {
  useCallback,
} from "react";
import type {
  EditorSessionState,
} from "../../domain/project/project-document";
import type {
  EditorRuntime,
} from "../../editor/runtime/editor-runtime";
import type {
  PersistedEditorWorkspace,
} from "../../persistence/project-persistence-model";
import {
  ProjectPersistenceError,
} from "../../persistence/project-persistence-model";
import {
  createPianolaProjectFileName,
} from "../../infrastructure/project-files/pianola/pianola-project-metadata";
import {
  serializePianolaProject,
} from "../../infrastructure/project-files/pianola/pianola-project-codec";
import { FILE_CONSTANTS } from "../../config/pianola-file-config";
import type {
  ShowApplicationAlert,
} from "../../use-cases/dialogs/application-dialog-port";
import {
  createDefaultPersistedEditorWorkspace,
  createEditorSessionState,
  restorePersistedEditorWorkspace,
} from "../../use-cases/persistence/project-workspace";
import {
  downloadBrowserFile,
} from "./download-browser-file";

export interface ProjectFileWorkflowOptions {
  readonly runtime: EditorRuntime;
  readonly documentId: string;
  readonly captureWorkspace: () => PersistedEditorWorkspace;
  readonly stopPlayback: () => void;
  readonly resetInteraction: () => void;
  readonly clearClipboard: () => void;
  readonly clearPendingMidiImport: () => void;
  readonly onSelectionCleared: () => void;
  readonly onWorkspaceRestored: (
    workspace: PersistedEditorWorkspace,
  ) => void;
  readonly alert: ShowApplicationAlert;
}

export interface ProjectFileWorkflow {
  readonly exportProject: () => void;
  readonly replaceActiveProject: (
    project: EditorSessionState,
    label: string,
  ) => void;
}

export function useProjectFileWorkflow({
  runtime,
  documentId,
  captureWorkspace,
  stopPlayback,
  resetInteraction,
  clearClipboard,
  clearPendingMidiImport,
  onSelectionCleared,
  onWorkspaceRestored,
  alert,
}: ProjectFileWorkflowOptions): ProjectFileWorkflow {
  const replaceActiveProject = useCallback((
    project: EditorSessionState,
    label: string,
  ): void => {
    stopPlayback();
    resetInteraction();
    clearClipboard();
    clearPendingMidiImport();
    onSelectionCleared();
    runtime.selectionRequests.clear();
    const workspace = createDefaultPersistedEditorWorkspace(project);
    runtime.editorCommands.replaceState(
      createEditorSessionState(project, workspace),
      label,
    );
    restorePersistedEditorWorkspace(runtime, workspace);
    onWorkspaceRestored(workspace);
  }, [
    clearClipboard,
    clearPendingMidiImport,
    onSelectionCleared,
    onWorkspaceRestored,
    resetInteraction,
    runtime,
    stopPlayback,
  ]);

  const exportProject = useCallback((): void => {
    try {
      const document = runtime.projectStore.getState();
      const serialized = serializePianolaProject({
        sourceDocumentId: documentId,
        exportedAt: new Date().toISOString(),
        document,
        workspace: captureWorkspace(),
      });
      const blob = new Blob([serialized], {
        type: "application/json;charset=utf-8",
      });

      if (blob.size > FILE_CONSTANTS.pianolaProjectMaximumBytes) {
        throw new ProjectPersistenceError(
          "INVALID_DATA",
          "The project is too large to export.",
        );
      }

      downloadBrowserFile(
        blob,
        createPianolaProjectFileName(document.title),
      );
    } catch (error: unknown) {
      alert(
        "Export failed",
        error instanceof Error
          ? error.message
          : "Unable to export the project.",
        "danger",
      );
    }
  }, [alert, captureWorkspace, documentId, runtime]);

  return {
    exportProject,
    replaceActiveProject,
  };
}
