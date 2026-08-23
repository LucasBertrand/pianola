import {
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  InstrumentId,
} from "../../domain/identifiers";
import type {
  EditorRuntime,
} from "../../editor/runtime/editor-runtime";
import type {
  ProjectRepository,
} from "../../persistence/project-persistence-model";
import {
  BROWSER_AUTOSAVE_SCHEDULER,
} from "../../pwa/persistence/browser-autosave-scheduler";
import {
  ProjectAutosave,
  type ProjectSaveStatus,
} from "../../use-cases/persistence/project-autosave";
import {
  captureProjectWorkspace,
} from "../../use-cases/persistence/project-workspace";

export interface ProjectAutosaveSession {
  readonly status: ProjectSaveStatus;
  readonly markWorkspaceDirty: () => void;
  readonly flush: () => Promise<void>;
}

export function useProjectAutosave(
  runtime: EditorRuntime,
  documentId: string,
  initialRevision: number,
  repository: ProjectRepository,
  selectedInstrumentId: InstrumentId | null,
): ProjectAutosaveSession {
  const selectedInstrumentRef = useRef(selectedInstrumentId);
  selectedInstrumentRef.current = selectedInstrumentId;
  const autosaveRef = useRef<ProjectAutosave | null>(null);

  if (autosaveRef.current === null) {
    autosaveRef.current = new ProjectAutosave({
      documentId,
      initialRevision,
      repository,
      scheduler: BROWSER_AUTOSAVE_SCHEDULER,
      capture: () => ({
        document: runtime.projectStore.getState(),
        workspace: captureProjectWorkspace(
          runtime,
          selectedInstrumentRef.current,
        ),
      }),
      now: () => new Date().toISOString(),
    });
  }

  const autosave = autosaveRef.current;
  const [status, setStatus] = useState<ProjectSaveStatus>(
    () => autosave.getStatus(),
  );
  const initialInstrumentRef = useRef(selectedInstrumentId);

  useEffect(() => autosave.subscribe(setStatus), [autosave]);

  useEffect(() => {
    const markDirty = (): void => autosave.markDirty();
    const unsubscribers = [
      runtime.projectStore.subscribe(markDirty),
      runtime.viewport.subscribe(markDirty),
      runtime.pitchSnapSettings.subscribe(markDirty),
      runtime.gridSettings.subscribe(markDirty),
    ];

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [autosave, runtime]);

  useEffect(() => {
    if (initialInstrumentRef.current === selectedInstrumentId) {
      initialInstrumentRef.current = null;
      return;
    }

    autosave.markDirty();
  }, [autosave, selectedInstrumentId]);

  useEffect(() => {
    const flushWhenHidden = (): void => {
      if (document.visibilityState === "hidden") {
        void autosave.flush().catch(() => undefined);
      }
    };
    const flushBeforePageHide = (): void => {
      void autosave.flush().catch(() => undefined);
    };

    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("pagehide", flushBeforePageHide);

    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden);
      window.removeEventListener("pagehide", flushBeforePageHide);
      void autosave.flush().catch(() => undefined);
    };
  }, [autosave]);

  return {
    status,
    markWorkspaceDirty: () => autosave.markDirty(),
    flush: () => autosave.flush(),
  };
}
