import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  createAppPersistenceRuntime,
  createEditorRuntime,
  type AppPersistenceRuntime,
} from "./create-app-runtime";
import {
  createBlankEditorSessionState,
} from "../use-cases/project-files/create-initial-project";
import type {
  EditorRuntime,
} from "../editor/runtime/editor-runtime";
import {
  PianoRollWorkspace,
} from "../ui/piano-roll/PianoRollWorkspace";
import {
  BrowserErrorBoundary,
} from "../ui/diagnostics/BrowserErrorBoundary";
import {
  BrowserErrorDialog,
} from "../ui/diagnostics/BrowserErrorDialog";
import {
  RenderBaselineProfiler,
} from "../ui/diagnostics/RenderBaselineProfiler";
import {
  browserErrorReporter,
} from "../ui/diagnostics/browser-error-reporter";
import {
  ApplicationHome,
} from "../ui/home/ApplicationHome";
import {
  createDefaultPersistedEditorWorkspace,
  createStoredEditorSessionState,
  restorePersistedEditorWorkspace,
} from "../use-cases/persistence/project-workspace";
import {
  createDocumentId,
  type ProjectSummary,
  type StoredProject,
} from "../application/ports/project-repository";
import {
  recoverDefaultUserSettings,
  type UserSettings,
} from "../application/ports/user-settings-repository";
import {
  parsePianolaProject,
} from "../infrastructure/project-files/pianola/pianola-project-codec";
import { FILE_CONSTANTS } from "../config/pianola-file-config";
import {
  requestPersistentBrowserStorage,
} from "../infrastructure/persistence/browser/browser-storage-policy";
import {
  createStoredProjectClone,
} from "../use-cases/persistence/clone-stored-project";

/** Creates the application runtime and exposes the top-level product surface. */
export function App(): React.JSX.Element {
  return (
    <>
      <BrowserErrorBoundary reporter={browserErrorReporter}>
        <EditorApplication />
      </BrowserErrorBoundary>
      <BrowserErrorDialog reporter={browserErrorReporter} />
    </>
  );
}

function EditorApplication(): React.JSX.Element {
  const persistence = getPersistenceRuntime();
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([]);
  const [settings, setSettings] = useState<UserSettings>(
    recoverDefaultUserSettings,
  );
  const [activeProject, setActiveProject] = useState<StoredProject | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshLibrary = useCallback(async (): Promise<void> => {
    setProjects(await persistence.projects.list());
  }, [persistence]);

  useEffect(() => {
    let active = true;

    void Promise.allSettled([
      persistence.projects.list(),
      persistence.userSettings.load(),
    ]).then(([projectResult, settingsResult]) => {
      if (!active) {
        return;
      }

      if (projectResult.status === "fulfilled") {
        setProjects(projectResult.value);
      } else {
        setError(formatPersistenceError(projectResult.reason));
      }

      if (settingsResult.status === "fulfilled") {
        setSettings(settingsResult.value);
      } else if (projectResult.status === "fulfilled") {
        setError(formatPersistenceError(settingsResult.reason));
      }
    }).finally(() => {
      if (active) {
        setBusy(false);
      }
    });

    return () => {
      active = false;
    };
  }, [persistence]);

  const runLibraryAction = useCallback(async (
    action: () => Promise<void>,
  ): Promise<void> => {
    setBusy(true);
    setError(null);

    try {
      await action();
    } catch (actionError: unknown) {
      setError(formatPersistenceError(actionError));
    } finally {
      setBusy(false);
    }
  }, []);

  const handleCreate = useCallback(() => runLibraryAction(async () => {
    const document = createBlankEditorSessionState();
    const now = new Date().toISOString();
    const candidate: StoredProject = {
      documentId: createDocumentId(),
      revision: 0,
      updatedAt: now,
      document,
      workspace: createDefaultPersistedEditorWorkspace(document),
    };
    const revision = await persistence.projects.save(candidate, null);
    void requestPersistentBrowserStorage();
    setActiveProject({ ...candidate, revision: revision.revision });
  }), [persistence, runLibraryAction]);

  const handleOpen = useCallback((documentId: string) =>
    runLibraryAction(async () => {
      const stored = await persistence.projects.load(documentId);

      if (stored === null) {
        throw new Error("This local project no longer exists.");
      }

      setActiveProject(stored);
    }), [persistence, runLibraryAction]);

  const handleClone = useCallback((documentId: string) =>
    runLibraryAction(async () => {
      const source = await persistence.projects.load(documentId);

      if (source === null) {
        throw new Error("This local project no longer exists.");
      }

      const candidate = createStoredProjectClone(
        source,
        createDocumentId(),
        new Date().toISOString(),
      );
      await persistence.projects.save(candidate, null);
      void requestPersistentBrowserStorage();
      await refreshLibrary();
    }), [persistence, refreshLibrary, runLibraryAction]);

  const handleImport = useCallback((file: File) =>
    runLibraryAction(async () => {
      if (file.size > FILE_CONSTANTS.pianolaProjectMaximumBytes) {
        throw new Error("The selected project file is too large.");
      }

      const imported = parsePianolaProject(await file.text());
      const candidate: StoredProject = {
        documentId: createDocumentId(),
        revision: 0,
        updatedAt: new Date().toISOString(),
        document: imported.document,
        workspace: imported.workspace,
      };
      const revision = await persistence.projects.save(candidate, null);
      void requestPersistentBrowserStorage();
      await refreshLibrary();
      setActiveProject({ ...candidate, revision: revision.revision });
    }), [persistence, refreshLibrary, runLibraryAction]);

  const handleRemove = useCallback((documentId: string) =>
    runLibraryAction(async () => {
      await persistence.projects.remove(documentId);
      await refreshLibrary();
    }), [persistence, refreshLibrary, runLibraryAction]);

  if (activeProject !== null) {
    return (
      <ActiveProjectEditor
        key={activeProject.documentId}
        storedProject={activeProject}
        settings={settings}
        persistence={persistence}
        onSettingsChange={setSettings}
        onClose={async () => {
          setActiveProject(null);
          await refreshLibrary();
        }}
      />
    );
  }

  return (
    <ApplicationHome
      projects={projects}
      busy={busy}
      error={error}
      onCreateProject={handleCreate}
      onOpenProject={handleOpen}
      onCloneProject={handleClone}
      onImportProject={handleImport}
      onRemoveProject={handleRemove}
    />
  );
}

let persistenceRuntime: AppPersistenceRuntime | null = null;

function getPersistenceRuntime(): AppPersistenceRuntime {
  persistenceRuntime ??= createAppPersistenceRuntime();
  return persistenceRuntime;
}

interface ActiveProjectEditorProps {
  readonly storedProject: StoredProject;
  readonly settings: UserSettings;
  readonly persistence: AppPersistenceRuntime;
  readonly onSettingsChange: (settings: UserSettings) => void;
  readonly onClose: () => void | Promise<void>;
}

function ActiveProjectEditor({
  storedProject,
  settings,
  persistence,
  onSettingsChange,
  onClose,
}: ActiveProjectEditorProps): React.JSX.Element {
  const runtimeRef = useRef<EditorRuntime | null>(null);

  if (runtimeRef.current === null) {
    runtimeRef.current = createEditorRuntime(
      createStoredEditorSessionState(storedProject),
    );
    runtimeRef.current.noteColorMode.set(settings.noteColorMode);
    restorePersistedEditorWorkspace(runtimeRef.current, storedProject.workspace);
  }

  return (
    <RenderBaselineProfiler id="PianoRollWorkspace">
      <PianoRollWorkspace
        runtime={runtimeRef.current}
        documentId={storedProject.documentId}
        storedRevision={storedProject.revision}
        initialWorkspace={storedProject.workspace}
        projectRepository={persistence.projects}
        initialUserSettings={settings}
        userSettingsRepository={persistence.userSettings}
        onUserSettingsChange={onSettingsChange}
        onCloseProject={onClose}
      />
    </RenderBaselineProfiler>
  );
}

function formatPersistenceError(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "Local persistence is unavailable.";
}
