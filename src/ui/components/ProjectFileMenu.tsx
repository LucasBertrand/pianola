import React, {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import {
  FILE_CONSTANTS,
  MIDI_CONSTANTS,
} from "../../config/program-constants";

export interface ProjectFileMenuProps {
  readonly projectInputRef: RefObject<HTMLInputElement | null>;
  readonly midiInputRef: RefObject<HTMLInputElement | null>;
  readonly onNewProject: () => void;
  readonly onSaveProject: () => void;
  readonly onOpenProject: () => void;
  readonly onOpenMidiImport: () => void;
  readonly onExportMidi: () => void;
  readonly onProjectFileChange: (
    event: ChangeEvent<HTMLInputElement>,
  ) => void | Promise<void>;
  readonly onMidiFileChange: (
    event: ChangeEvent<HTMLInputElement>,
  ) => void | Promise<void>;
}

export function ProjectFileMenu({
  projectInputRef: loadProjectInputRef,
  midiInputRef: importMidiInputRef,
  onNewProject: handleNewProject,
  onSaveProject: handleSaveProject,
  onOpenProject: handleOpenProject,
  onOpenMidiImport: handleOpenMidiImport,
  onExportMidi: handleExportMidi,
  onProjectFileChange: handleProjectFileChange,
  onMidiFileChange: handleMidiFileChange,
}: ProjectFileMenuProps): React.JSX.Element {
  const projectFileMenuRef = useRef<HTMLDivElement | null>(null);
  const [projectFileMenuOpen, setProjectFileMenuOpen] =
    useState(false);

  useEffect(() => {
    if (!projectFileMenuOpen) {
      return undefined;
    }

    const handleOutsidePointerDown = (event: PointerEvent): void => {
      const menu = projectFileMenuRef.current;

      if (
        menu !== null
        && event.target instanceof Node
        && !menu.contains(event.target)
      ) {
        setProjectFileMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handleOutsidePointerDown);

    return () => {
      window.removeEventListener(
        "pointerdown",
        handleOutsidePointerDown,
      );
    };
  }, [projectFileMenuOpen]);

  return (
  <div
    className="topbar-actions"
    aria-label="Project and history actions"
  >
    <div
      ref={projectFileMenuRef}
      className="project-file-menu"
    >
      <button
        className="topbar-icon-button"
        type="button"
        title="File menu"
        aria-label="File menu"
        aria-haspopup="menu"
        aria-expanded={projectFileMenuOpen}
        aria-controls="project-file-menu"
        onClick={() => {
          setProjectFileMenuOpen((open) => !open);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <div
        id="project-file-menu"
        className="project-file-menu-popover"
        role="menu"
        aria-label="File"
        hidden={!projectFileMenuOpen}
      >
        <button
          className="project-file-menu-item"
          type="button"
          role="menuitem"
          onClick={() => {
            setProjectFileMenuOpen(false);
            handleNewProject();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3h8l4 4v14H6z" />
            <path d="M14 3v5h5M9 14h6M12 11v6" />
          </svg>
          <span>New project</span>
        </button>
        <button
          className="project-file-menu-item"
          type="button"
          role="menuitem"
          onClick={() => {
            setProjectFileMenuOpen(false);
            handleSaveProject();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 3h12l2 2v16H5z" />
            <path d="M8 3v6h8V3M8 21v-8h8v8" />
          </svg>
          <span>Save project</span>
        </button>
        <button
          className="project-file-menu-item"
          type="button"
          role="menuitem"
          onClick={() => {
            setProjectFileMenuOpen(false);
            handleOpenProject();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 7h7l2 2h9v11H3z" />
            <path d="M12 12v6M9.5 15.5 12 18l2.5-2.5" />
          </svg>
          <span>Load project</span>
        </button>
        <button
          className="project-file-menu-item"
          type="button"
          role="menuitem"
          onClick={() => {
            setProjectFileMenuOpen(false);
            handleOpenMidiImport();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3h8l4 4v14H6z" />
            <path d="M14 3v5h5M12 11v7M9 15l3 3 3-3" />
          </svg>
          <span>Import MIDI</span>
        </button>
        <button
          className="project-file-menu-item"
          type="button"
          role="menuitem"
          onClick={() => {
            setProjectFileMenuOpen(false);
            handleExportMidi();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3h8l4 4v14H6z" />
            <path d="M14 3v5h5M12 18v-7M9 14l3-3 3 3" />
          </svg>
          <span>Export MIDI</span>
        </button>
      </div>
      <input
        ref={loadProjectInputRef}
        className="project-file-input"
        type="file"
        accept={
          `${FILE_CONSTANTS.nativeProjectExtension},`
          + "application/json"
        }
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          void handleProjectFileChange(event);
        }}
      />
      <input
        ref={importMidiInputRef}
        className="project-file-input"
        type="file"
        accept={[
          ...MIDI_CONSTANTS.acceptedFileExtensions,
          ...MIDI_CONSTANTS.acceptedMimeTypes,
        ].join(",")}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          void handleMidiFileChange(event);
        }}
      />
    </div>
  </div>
  
  );
}

