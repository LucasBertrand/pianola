import {
  useCallback,
  useRef,
  type ChangeEvent,
  type RefObject,
} from "react";
import type {
  ProjectState,
} from "../../domain/model";
import {
  downloadBrowserFile,
} from "./download-browser-file";
import {
  createNativeProjectFileName,
  MAXIMUM_NATIVE_PROJECT_FILE_BYTES,
  NativeProjectFileError,
  parseNativeProjectFile,
  serializeNativeProjectFile,
  type NativeEditorState,
  type NativeProjectFileMetadata,
} from "../../project-io/native/native-project-file";
import {
  createBlankProjectState,
} from "../../use-cases/project-files/create-initial-project";
import type {
  EditorRuntime,
} from "../../editor/runtime/editor-runtime";
import type {
  ShowApplicationAlert,
  ShowApplicationConfirmation,
} from "../../use-cases/dialogs/application-dialog-port";
import {
  createDefaultNativeEditorState,
  createNativeProjectFileMetadata,
  formatNativeProjectError,
} from "../../use-cases/project-files/native-editor-state";

export interface ProjectFileWorkflowOptions {
  readonly runtime: EditorRuntime;
  readonly getEditorState: () => NativeEditorState;
  readonly stopPlayback: () => void;
  readonly seekPlayback: (tick: number) => void;
  readonly resetInteraction: () => void;
  readonly clearClipboard: () => void;
  readonly clearPendingMidiImport: () => void;
  readonly onSelectionCleared: () => void;
  readonly onEditorStateRestored: (
    project: ProjectState,
    editorState: NativeEditorState,
  ) => void;
  readonly alert: ShowApplicationAlert;
  readonly confirm: ShowApplicationConfirmation;
}

export interface ProjectFileWorkflow {
  readonly loadInputRef: RefObject<HTMLInputElement | null>;
  readonly save: () => void;
  readonly createNew: () => void;
  readonly open: () => void;
  readonly load: (
    event: ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
  readonly replaceActiveProject: (
    project: ProjectState,
    metadata: NativeProjectFileMetadata,
    label: string,
    editorState: NativeEditorState,
  ) => void;
}

export function useProjectFileWorkflow({
  runtime,
  getEditorState,
  stopPlayback,
  seekPlayback,
  resetInteraction,
  clearClipboard,
  clearPendingMidiImport,
  onSelectionCleared,
  onEditorStateRestored,
  alert,
  confirm,
}: ProjectFileWorkflowOptions): ProjectFileWorkflow {
  const loadInputRef = useRef<HTMLInputElement | null>(null);
  const metadataRef = useRef<NativeProjectFileMetadata | null>(null);

  if (metadataRef.current === null) {
    metadataRef.current = createNativeProjectFileMetadata();
  }

  const replaceActiveProject = useCallback(
    (
      project: ProjectState,
      metadata: NativeProjectFileMetadata,
      label: string,
      restoredEditorState: NativeEditorState,
    ): void => {
      stopPlayback();
      resetInteraction();
      clearClipboard();
      clearPendingMidiImport();
      onSelectionCleared();
      runtime.selectionRequests.clear();
      runtime.noteColorMode.set(restoredEditorState.noteColorMode);
      metadataRef.current = metadata;
      runtime.projectStore.replaceState(project, label);
      const viewportBase = runtime.viewport.get();
      const clipRuntimeStates = Object.fromEntries(
        Object.entries(restoredEditorState.clipStatesById).map(
          ([clipId, clipState]) => [
            clipId,
            {
              ...clipState,
              viewport: {
                ...viewportBase,
                ...clipState.viewport,
              },
            },
          ],
        ),
      );

      runtime.restoreClipEditorStates(clipRuntimeStates);
      onEditorStateRestored(project, restoredEditorState);
      seekPlayback(runtime.playheadTick.get());
    },
    [
      clearClipboard,
      clearPendingMidiImport,
      onEditorStateRestored,
      onSelectionCleared,
      resetInteraction,
      runtime,
      seekPlayback,
      stopPlayback,
    ],
  );

  const save = useCallback((): void => {
    try {
      const currentMetadata =
        metadataRef.current ?? createNativeProjectFileMetadata();
      const metadata: NativeProjectFileMetadata = {
        ...currentMetadata,
        savedAt: new Date().toISOString(),
      };
      const state = runtime.projectStore.getState();
      const serialized = serializeNativeProjectFile(
        state,
        metadata,
        getEditorState(),
      );
      const blob = new Blob(
        [serialized],
        {
          type: "application/json;charset=utf-8",
        },
      );

      if (blob.size > MAXIMUM_NATIVE_PROJECT_FILE_BYTES) {
        throw new NativeProjectFileError(
          "INVALID_DATA",
          "$",
          "The project is too large to save as a native file.",
        );
      }

      metadataRef.current = metadata;
      downloadBrowserFile(
        blob,
        createNativeProjectFileName(state.title),
      );
    } catch (error: unknown) {
      alert(
        "Save failed",
        formatNativeProjectError(
          "Unable to save the project.",
          error,
        ),
        "danger",
      );
    }
  }, [alert, getEditorState, runtime]);

  const createNew = useCallback((): void => {
    confirm({
      title: "Create a new project?",
      message: "Unsaved changes in the current project will be lost.",
      confirmLabel: "Create project",
      tone: "danger",
      onConfirm(): void {
        const project = createBlankProjectState();

        replaceActiveProject(
          project,
          createNativeProjectFileMetadata(),
          "Create project",
          createDefaultNativeEditorState(project),
        );
      },
    });
  }, [confirm, replaceActiveProject]);

  const open = useCallback((): void => {
    const input = loadInputRef.current;

    if (input !== null) {
      input.value = "";
      input.click();
    }
  }, []);

  const load = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const input = event.currentTarget;
      const file = input.files?.[0];

      if (file === undefined) {
        return;
      }

      try {
        if (file.size > MAXIMUM_NATIVE_PROJECT_FILE_BYTES) {
          throw new NativeProjectFileError(
            "INVALID_DATA",
            "$",
            "The selected project file is too large.",
          );
        }

        const loadedProject = parseNativeProjectFile(await file.text());

        replaceActiveProject(
          loadedProject.projectState,
          loadedProject.metadata,
          "Load project",
          loadedProject.editorState,
        );
      } catch (error: unknown) {
        alert(
          "Load failed",
          formatNativeProjectError(
            "Unable to load the project.",
            error,
          ),
          "danger",
        );
      } finally {
        input.value = "";
      }
    },
    [alert, replaceActiveProject],
  );

  return {
    loadInputRef,
    save,
    createNew,
    open,
    load,
    replaceActiveProject,
  };
}
