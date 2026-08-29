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
} from "../application/project-files/create-initial-project";
import type {
  EditorRuntime,
} from "../application/editor-session/editor-runtime";
import {
  PianoRollWorkspace,
} from "../presentation/piano-roll/PianoRollWorkspace";
import {
  BrowserErrorBoundary,
} from "../presentation/diagnostics/BrowserErrorBoundary";
import {
  BrowserErrorDialog,
} from "../presentation/diagnostics/BrowserErrorDialog";
import {
  browserErrorReporter,
} from "../presentation/diagnostics/browser-error-reporter";
import {
  ApplicationHome,
} from "../presentation/home/ApplicationHome";
import {
  createDefaultPersistedEditorWorkspace,
  createStoredEditorSessionState,
  restorePersistedEditorWorkspace,
} from "../application/editor-session/workspace-persistence";
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
import { FILE_CONSTANTS } from "../infrastructure/project-files/pianola/pianola-file-constants";
import {
  requestPersistentBrowserStorage,
} from "../infrastructure/persistence/browser/browser-storage-policy";
import {
  createStoredProjectClone,
} from "../application/persistence/clone-stored-project";
import {
  downloadBrowserFile,
} from "../presentation/project-files/download-browser-file";
import {
  useProjectMigrationDialog,
} from "../presentation/project-files/useProjectMigrationDialog";

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
  const {
    migrationDialog,
    showMigrationReport,
  } = useProjectMigrationDialog();
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
      const loaded = await persistence.projects.load(documentId);

      if (loaded === null) {
        throw new Error("This local project no longer exists.");
      }

      showMigrationReport(
        loaded.migration,
        "Local project updated",
      );
      setActiveProject(loaded.project);
    }), [persistence, runLibraryAction, showMigrationReport]);

  const handleClone = useCallback((documentId: string) =>
    runLibraryAction(async () => {
      const loaded = await persistence.projects.load(documentId);

      if (loaded === null) {
        throw new Error("This local project no longer exists.");
      }

      const candidate = createStoredProjectClone(
        loaded.project,
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

      const source = await file.text();
      const imported = parsePianolaProject(source);
      const candidate: StoredProject = {
        documentId: createDocumentId(),
        revision: 0,
        updatedAt: new Date().toISOString(),
        document: imported.project.document,
        workspace: imported.project.workspace,
      };
      const revision = await persistence.projects.save(candidate, null);
      void requestPersistentBrowserStorage();
      await refreshLibrary();
      showMigrationReport(
        imported.migration,
        "Imported project updated",
      );
      setActiveProject({ ...candidate, revision: revision.revision });
    }), [
      persistence,
      refreshLibrary,
      runLibraryAction,
      showMigrationReport,
    ]);

  const handleRemove = useCallback((documentId: string) =>
    runLibraryAction(async () => {
      await persistence.projects.remove(documentId);
      await refreshLibrary();
    }), [persistence, refreshLibrary, runLibraryAction]);

  const handleExportRecovery = useCallback((documentId: string) =>
    runLibraryAction(async () => {
      const recovery = await persistence.projects.exportRecovery(documentId);

      if (recovery === null) {
        throw new Error("No original project generation is available.");
      }

      downloadBrowserFile(
        new Blob([recovery.archive], { type: "application/json;charset=utf-8" }),
        recovery.archiveFileName,
      );
      downloadBrowserFile(
        new Blob([recovery.diagnostic], { type: "text/plain;charset=utf-8" }),
        recovery.diagnosticFileName,
      );
    }), [persistence, runLibraryAction]);

  if (activeProject !== null) {
    return (
      <>
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
        {migrationDialog}
      </>
    );
  }

  return (
    <>
      <ApplicationHome
        projects={projects}
        busy={busy}
        error={error}
        onCreateProject={handleCreate}
        onOpenProject={handleOpen}
        onCloneProject={handleClone}
        onImportProject={handleImport}
        onExportRecovery={handleExportRecovery}
        onRemoveProject={handleRemove}
      />
      {migrationDialog}
    </>
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
  );
}

function formatPersistenceError(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "Local persistence is unavailable.";
}
