import React, {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import {
  MIDI_CONSTANTS,
} from "../../project-io/midi/midi-constants";
import {
  MAXIMUM_PROJECT_TITLE_LENGTH,
} from "../../domain/project/project-document";

export interface ProjectMenuProps {
  readonly projectTitle: string;
  readonly midiInputRef: RefObject<HTMLInputElement | null>;
  readonly onReturnHome: () => void | Promise<void>;
  readonly onExportProject: () => void;
  readonly onOpenMidiImport: () => void;
  readonly onExportMidi: () => void;
  readonly onMidiFileChange: (
    event: ChangeEvent<HTMLInputElement>,
  ) => void | Promise<void>;
  readonly onProjectTitleCommit: (input: HTMLInputElement) => void;
}

export function ProjectMenu({
  projectTitle,
  midiInputRef,
  onReturnHome,
  onExportProject,
  onOpenMidiImport,
  onExportMidi,
  onMidiFileChange,
  onProjectTitleCommit,
}: ProjectMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const closeFromOutside = (event: PointerEvent): void => {
      if (
        menuRef.current !== null
        && event.target instanceof Node
        && !menuRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeFromOutside);

    return () => {
      window.removeEventListener("pointerdown", closeFromOutside);
    };
  }, [open]);

  const close = (): void => setOpen(false);

  return (
    <div
      ref={menuRef}
      className="project-menu"
      role="group"
      aria-label="Project actions"
    >
        <button
          className="project-menu-trigger"
          type="button"
          title="Project menu"
          aria-label="Project menu"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls="project-menu-popover"
          onClick={() => setOpen((current) => !current)}
        >
          <ProjectMenuIcon name="project" />
          <svg
            className="project-menu-chevron"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path d="m3 4.5 3 3 3-3" />
          </svg>
        </button>

        <div
          id="project-menu-popover"
          className="project-menu-popover"
          role="menu"
          aria-label="Project"
          hidden={!open}
        >
          <input
            key={projectTitle}
            className="project-menu-title-input"
            type="text"
            maxLength={MAXIMUM_PROJECT_TITLE_LENGTH}
            defaultValue={projectTitle}
            aria-label="Project title"
            onBlur={(event) => {
              onProjectTitleCommit(event.currentTarget);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />

          <div
            className="project-menu-group"
            role="group"
            aria-label="Navigation"
          >
            <span className="project-menu-group-label">Navigation</span>
            <ProjectMenuItem
              icon="home"
              label="Return home"
              description="Close this editing session"
              onSelect={() => {
                close();
                void onReturnHome();
              }}
            />
          </div>

          <div
            className="project-menu-group"
            role="group"
            aria-label="Exchange"
          >
            <span className="project-menu-group-label">Exchange</span>
            <ProjectMenuItem
              icon="project-export"
              label="Export project"
              description="Download a portable .pianola copy"
              onSelect={() => {
                close();
                onExportProject();
              }}
            />
            <ProjectMenuItem
              icon="midi-import"
              label="Import MIDI"
              description="Replace the active composition"
              onSelect={() => {
                close();
                onOpenMidiImport();
              }}
            />
            <ProjectMenuItem
              icon="midi-export"
              label="Export MIDI"
              description="Download the active clip as MIDI"
              onSelect={() => {
                close();
                onExportMidi();
              }}
            />
          </div>
        </div>

        <input
          ref={midiInputRef}
          className="project-file-input"
          type="file"
          accept={[
            ...MIDI_CONSTANTS.acceptedFileExtensions,
            ...MIDI_CONSTANTS.acceptedMimeTypes,
          ].join(",")}
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => void onMidiFileChange(event)}
        />
    </div>
  );
}

interface ProjectMenuItemProps {
  readonly icon: ProjectMenuIconName;
  readonly label: string;
  readonly description: string;
  readonly onSelect: () => void;
}

function ProjectMenuItem({
  icon,
  label,
  description,
  onSelect,
}: ProjectMenuItemProps): React.JSX.Element {
  return (
    <button
      className="project-menu-item"
      type="button"
      role="menuitem"
      onClick={onSelect}
    >
      <span className="project-menu-item-icon" aria-hidden="true">
        <ProjectMenuIcon name={icon} />
      </span>
      <span className="project-menu-item-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}

type ProjectMenuIconName =
  | "home"
  | "midi-export"
  | "midi-import"
  | "project"
  | "project-export";

function ProjectMenuIcon({
  name,
}: {
  readonly name: ProjectMenuIconName;
}): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {getProjectMenuIconPaths(name)}
    </svg>
  );
}

function getProjectMenuIconPaths(
  name: ProjectMenuIconName,
): React.JSX.Element {
  switch (name) {
    case "project":
      return (
        <>
          <path d="M3.5 6.5h6l2 2h9v10h-17z" />
          <path d="M8 12h8M8 15.5h5" />
        </>
      );
    case "home":
      return (
        <>
          <path d="m3.5 11 8.5-7 8.5 7" />
          <path d="M5.5 9.5v10h13v-10M9.5 19.5v-6h5v6" />
        </>
      );
    case "project-export":
      return (
        <>
          <path d="M6 3.5h8l4 4v13H6zM14 3.5v4h4" />
          <path d="M12 10v7M9.5 14.5 12 17l2.5-2.5" />
        </>
      );
    case "midi-import":
      return (
        <>
          <path
            d="M8 5.5 15 4v11.5M15 7.5 8 9V5.5M8 9v8"
            strokeLinejoin="bevel"
          />
          <ellipse cx="5.5" cy="17" rx="2.5" ry="2" />
          <ellipse cx="12.5" cy="15.5" rx="2.5" ry="2" />
          <path d="M19.5 5v5M17.5 8l2 2 2-2" />
        </>
      );
    case "midi-export":
      return (
        <>
          <path
            d="M8 5.5 15 4v11.5M15 7.5 8 9V5.5M8 9v8"
            strokeLinejoin="bevel"
          />
          <ellipse cx="5.5" cy="17" rx="2.5" ry="2" />
          <ellipse cx="12.5" cy="15.5" rx="2.5" ry="2" />
          <path d="M19.5 10V5M17.5 7l2-2 2 2" />
        </>
      );
  }
}
