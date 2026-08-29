import React, {
  useRef,
  type ChangeEvent,
} from "react";
import {
  FILE_CONSTANTS,
} from "../../infrastructure/project-files/pianola/pianola-file-constants";
import type {
  ProjectSummary,
} from "../../application/ports/project-repository";
import {
  ApplicationDialogOverlay,
} from "../dialogs/ApplicationDialogOverlay";
import {
  useApplicationDialogs,
} from "../dialogs/useApplicationDialogs";

export interface ApplicationHomeProps {
  readonly projects: readonly ProjectSummary[];
  readonly busy: boolean;
  readonly error: string | null;
  readonly onCreateProject: () => void | Promise<void>;
  readonly onOpenProject: (documentId: string) => void | Promise<void>;
  readonly onCloneProject: (documentId: string) => void | Promise<void>;
  readonly onImportProject: (file: File) => void | Promise<void>;
  readonly onExportRecovery: (documentId: string) => void | Promise<void>;
  readonly onRemoveProject: (documentId: string) => void | Promise<void>;
}

/** Application entry surface. Project management is its first capability. */
export function ApplicationHome({
  projects,
  busy,
  error,
  onCreateProject,
  onOpenProject,
  onCloneProject,
  onImportProject,
  onExportRecovery,
  onRemoveProject,
}: ApplicationHomeProps): React.JSX.Element {
  const {
    dialog,
    confirm,
    accept,
    acceptAlternate,
    cancel,
  } = useApplicationDialogs();

  const requestProjectRemoval = (project: ProjectSummary): void => {
    confirm({
      title: "Delete project?",
      message: `“${project.title}” will be permanently removed from this device.`,
      confirmLabel: "Delete project",
      cancelLabel: "Keep project",
      tone: "danger",
      onConfirm: () => {
        void onRemoveProject(project.documentId);
      },
    });
  };

  return (
    <>
      <main className="application-home">
        <header className="application-home-header">
          <p className="application-home-kicker">Pianola</p>
          <h1>Welcome</h1>
          <p>
            Create, edit and keep your music close at hand.
            Everything stays local to this installation.
          </p>
        </header>

        {error === null ? null : (
          <p className="application-home-error" role="alert">{error}</p>
        )}

        <LocalProjectCollection
          projects={projects}
          busy={busy}
          onCreate={onCreateProject}
          onOpen={onOpenProject}
          onClone={onCloneProject}
          onImport={onImportProject}
          onExportRecovery={onExportRecovery}
          onRemove={requestProjectRemoval}
        />
      </main>
      <ApplicationDialogOverlay
        dialog={dialog}
        onConfirm={accept}
        onAlternate={acceptAlternate}
        onCancel={cancel}
      />
    </>
  );
}

interface LocalProjectCollectionProps {
  readonly projects: readonly ProjectSummary[];
  readonly busy: boolean;
  readonly onCreate: () => void | Promise<void>;
  readonly onOpen: (documentId: string) => void | Promise<void>;
  readonly onClone: (documentId: string) => void | Promise<void>;
  readonly onImport: (file: File) => void | Promise<void>;
  readonly onExportRecovery: (documentId: string) => void | Promise<void>;
  readonly onRemove: (project: ProjectSummary) => void;
}

function LocalProjectCollection({
  projects,
  busy,
  onCreate,
  onOpen,
  onClone,
  onImport,
  onExportRecovery,
  onRemove,
}: LocalProjectCollectionProps): React.JSX.Element {
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const handleImport = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (file !== undefined) {
      await onImport(file);
    }

    input.value = "";
  };

  return (
    <section className="application-home-section" aria-labelledby="projects-title">
      <div className="application-home-section-header">
        <div>
          <h2 id="projects-title">Projects</h2>
          <p>
            Saved automatically in this browser. Export a portable copy
            whenever you need one.
          </p>
        </div>
        <div className="application-home-project-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onCreate()}
          >
            New project
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => importInputRef.current?.click()}
          >
            Import .pianola
          </button>
          <input
            ref={importInputRef}
            className="project-file-input"
            type="file"
            accept={
              `${FILE_CONSTANTS.pianolaProjectExtension},application/json`
            }
            onChange={(event) => void handleImport(event)}
          />
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="application-home-project-empty">
          <h3>No local project yet</h3>
          <p>Create a project or import a portable Pianola file.</p>
        </div>
      ) : (
        <div className="application-home-project-grid">
          {projects.map((project) => (
            <article
              className="application-home-project-card"
              key={project.documentId}
            >
              <button
                type="button"
                className="application-home-project-open"
                disabled={busy}
                onClick={() => void onOpen(project.documentId)}
              >
                <strong>{project.title}</strong>
                <span>{formatUpdatedAt(project.updatedAt)}</span>
                <span>
                  Version {project.schemaVersion} · Revision {project.revision}
                  {" · "}{formatBytes(project.byteSize)}
                </span>
              </button>
              <div className="application-home-project-card-actions">
                <button
                  type="button"
                  className="application-home-project-clone"
                  aria-label={`Clone ${project.title}`}
                  disabled={busy}
                  onClick={() => void onClone(project.documentId)}
                >
                  Clone
                </button>
                <button
                  type="button"
                  className="application-home-project-recovery"
                  aria-label={`Export recovery data for ${project.title}`}
                  disabled={busy}
                  onClick={() => void onExportRecovery(project.documentId)}
                >
                  Recovery
                </button>
                <button
                  type="button"
                  className="application-home-project-remove"
                  aria-label={`Delete ${project.title}`}
                  disabled={busy}
                  onClick={() => onRemove(project)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) {
    return `${bytes} B`;
  }

  if (bytes < 1_024 * 1_024) {
    return `${(bytes / 1_024).toFixed(1)} KB`;
  }

  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}
