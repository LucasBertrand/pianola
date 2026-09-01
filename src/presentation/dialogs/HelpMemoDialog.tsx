import React, {
  useEffect,
  useRef,
} from "react";
import {
  createPortal,
} from "react-dom";
import {
  CommandIcon,
} from "../command-icons/CommandIcon";

export interface HelpMemoDialogProps {
  readonly onClose: () => void;
}

type MemoIconName =
  | "add-measures"
  | "augment"
  | "auto-fit"
  | "auto-scroll"
  | "clips"
  | "delete"
  | "diminish"
  | "grid"
  | "instruments"
  | "invert"
  | "labels"
  | "loop"
  | "measures"
  | "next-clip"
  | "pitch-color"
  | "pitch-guide"
  | "pitch-snap"
  | "redo"
  | "retrograde"
  | "selection-add"
  | "selection-replace"
  | "selection-subtract"
  | "start"
  | "undo"
  | "viewport";

interface MemoCommand {
  readonly icon: MemoIconName | "copy" | "cut" | "marker" | "mute"
    | "paste" | "play" | "slice";
  readonly label: string;
  readonly description: string;
}

const commandGroups: ReadonlyArray<{
  readonly title: string;
  readonly commands: readonly MemoCommand[];
}> = [
  {
    title: "Project and timeline",
    commands: [
      { icon: "instruments", label: "Instruments", description: "Open the project instrument inspector." },
      { icon: "clips", label: "Clips", description: "Open the clip and group inspector." },
      { icon: "undo", label: "Undo", description: "Undo the latest musical transaction." },
      { icon: "redo", label: "Redo", description: "Restore the last undone transaction." },
      { icon: "marker", label: "Add marker", description: "Create a marker at the captured playhead position." },
      { icon: "add-measures", label: "Add measures", description: "Insert measures before or after the current measure." },
      { icon: "measures", label: "Remove measures", description: "Remove a measured span and shift following content." },
    ],
  },
  {
    title: "Selection and clipboard",
    commands: [
      { icon: "delete", label: "Delete", description: "Delete editable selected notes and markers." },
      { icon: "mute", label: "Mute / unmute", description: "Toggle the audible state of selected notes." },
      { icon: "copy", label: "Copy", description: "Copy selected notes and movable markers." },
      { icon: "cut", label: "Cut", description: "Copy, then remove the editable selection." },
      { icon: "paste", label: "Paste", description: "Paste clipboard content at the playhead." },
      { icon: "selection-replace", label: "Replace", description: "Make the next gesture replace the selection." },
      { icon: "selection-add", label: "Add", description: "Make the next gesture extend the selection." },
      { icon: "selection-subtract", label: "Subtract", description: "Make the next gesture remove from the selection." },
    ],
  },
  {
    title: "Musical transformations",
    commands: [
      { icon: "slice", label: "Slice", description: "Cut selected notes at the playhead or loop anchors." },
      { icon: "invert", label: "Invert", description: "Mirror selected melodic intervals vertically." },
      { icon: "retrograde", label: "Retrograde", description: "Reverse the selected motif in time." },
      { icon: "augment", label: "Augment", description: "Double the rhythmic spacing and durations." },
      { icon: "diminish", label: "Diminish", description: "Halve the rhythmic spacing and durations." },
    ],
  },
  {
    title: "Transport",
    commands: [
      { icon: "start", label: "Return to start", description: "Move the playhead and horizontal view to the start." },
      { icon: "play", label: "Play / pause", description: "Start or suspend audio playback." },
      { icon: "loop", label: "Loop", description: "Repeat the active clip between its loop anchors." },
      { icon: "next-clip", label: "Clip chaining", description: "Continue to the next playable clip or stop at the end." },
      { icon: "auto-scroll", label: "Auto-scroll", description: "Follow the playing clip and playhead automatically." },
    ],
  },
  {
    title: "Grid and viewport",
    commands: [
      { icon: "viewport", label: "Position and zoom", description: "Navigate horizontally in time and vertically in pitch." },
      { icon: "grid", label: "Grid", description: "Choose the rhythmic resolution and subdivision." },
      { icon: "pitch-snap", label: "Pitch snap", description: "Constrain note pitches to the active scale or chord." },
      { icon: "pitch-guide", label: "Pitch guide", description: "Color the grid with the active scale or chord." },
      { icon: "pitch-color", label: "Note colors", description: "Color notes by pitch or by instrument." },
      { icon: "labels", label: "Note labels", description: "Display pitch names or harmonic degrees." },
      { icon: "auto-fit", label: "Auto-fit", description: "Frame the useful note range and timeline content." },
    ],
  },
];

/** Read-only, transient reference for the editor's visible commands and concepts. */
export function HelpMemoDialog({
  onClose,
}: HelpMemoDialogProps): React.JSX.Element {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const closeFromKeyboard = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", closeFromKeyboard);
    return () => window.removeEventListener("keydown", closeFromKeyboard);
  }, [onClose]);

  const dialog = (
    <div className="application-dialog-backdrop help-memo-backdrop">
      <section
        className="application-dialog help-memo-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-memo-title"
        aria-describedby="help-memo-intro"
      >
        <header className="help-memo-header">
          <div className="application-dialog-heading">
            <span className="application-dialog-mark" aria-hidden="true">?</span>
            <div>
              <h2 id="help-memo-title">Editor memo</h2>
              <p id="help-memo-intro">
                A quick reference for the toolbars and the editor concepts that
                shape your project.
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            className="help-memo-close"
            type="button"
            aria-label="Close editor memo"
            title="Close"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="help-memo-command-groups">
          {commandGroups.map((group) => (
            <section className="help-memo-command-group" key={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.commands.map((command) => (
                  <li key={`${group.title}-${command.label}`}>
                    <span className="help-memo-command-icon" aria-hidden="true">
                      <MemoIcon name={command.icon} />
                    </span>
                    <span>
                      <strong>{command.label}</strong>
                      <small>{command.description}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>        
      </section>
    </div>
  );

  return typeof document === "undefined"
    ? dialog
    : createPortal(dialog, document.body);
}

function MemoIcon({
  name,
}: {
  readonly name: MemoCommand["icon"];
}): React.JSX.Element {
  if (
    name === "copy" || name === "cut" || name === "marker"
    || name === "mute" || name === "paste" || name === "play"
    || name === "slice"
  ) {
    return <CommandIcon kind={name} />;
  }

  return (
    <svg
      className={name === "pitch-color" ? "is-note-color-brush" : undefined}
      viewBox={name === "pitch-color"
        ? "0 0 16 16"
        : name === "pitch-guide"
          ? "0 0 20 20"
          : "0 0 24 24"}
      focusable="false"
      aria-hidden="true"
    >
      {renderMemoIconPaths(name)}
    </svg>
  );
}

function renderMemoIconPaths(name: MemoIconName): React.ReactNode {
  switch (name) {
    case "instruments":
      return <><rect x="3" y="5" width="18" height="14" /><path d="M7.5 5v14M12 5v14M16.5 5v14M6.2 5h2.6v7H6.2zM10.7 5h2.6v7h-2.6zM15.2 5h2.6v7h-2.6z" /></>;
    case "clips":
      return <><path d="M3 7h7l2-2h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7ZM3 9h18" /></>;
    case "undo":
      return <><path d="m9 7-5 5 5 5M5 12h8a6 6 0 0 1 6 6" /></>;
    case "redo":
      return <><path d="m15 7 5 5-5 5M19 12h-8a6 6 0 0 0-6 6" /></>;
    case "add-measures":
      return <><path d="M7 4v16M11 4v16M15 12h6M18 9v6" /></>;
    case "measures":
      return <><path d="M7 4v16M11 4v16M15 12h6" /></>;
    case "delete":
      return <><path d="M4 7h16m-11 0 .7-2h4.6l.7 2M6.5 7l.8 13h9.4l.8-13M10 11v5m4-5v5" /></>;
    case "selection-replace":
      return <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="8" y="8" width="8" height="8" rx="1" /></>;
    case "selection-add":
      return <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M12 8v8M8 12h8" /></>;
    case "selection-subtract":
      return <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 12h8" /></>;
    case "invert":
      return <><path d="M5 3h14l-7 7ZM3 12h18M5 21h14l-7-7Z" /></>;
    case "retrograde":
      return <><path d="M3 5v14l7-7ZM12 3v18M21 5v14l-7-7Z" /></>;
    case "augment":
      return <><path d="M7 12H2m0 0 2.5-2.5M2 12l2.5 2.5M18 12h5m0 0-2.5-2.5M23 12l-2.5 2.5M15 5v10" /><ellipse cx="12" cy="17" rx="3" ry="2" /></>;
    case "diminish":
      return <><path d="M2 12h5m-2.5-2.5L7 12l-2.5 2.5M22 12h-5m2.5-2.5L17 12l2.5 2.5M14 5v10" /><ellipse cx="11" cy="17" rx="3" ry="2" /></>;
    case "start":
      return <><path d="M5 5v14m13-13-8 6 8 6Z" /></>;
    case "loop":
      return <><path d="M20 11A8 8 0 0 0 5.4 6.5M5.4 3v3.5h3.5M4 13a8 8 0 0 0 14.6 4.5M18.6 21v-3.5h-3.5" /></>;
    case "next-clip":
      return <><path d="M4 12h12m-4-5 5 5-5 5M20 6v12" /></>;
    case "auto-scroll":
      return <><path d="M12 4v16M8 7l-3 5 3 5m8-10 3 5-3 5" /></>;
    case "viewport":
      return <><path d="M4 12h16M7 9l-3 3 3 3m10-6 3 3-3 3M12 4v16M9 7l3-3 3 3m-6 10 3 3 3-3" /></>;
    case "grid":
      return <><rect x="4" y="4" width="16" height="16" /><path d="M4 10h16M4 15h16M10 4v16M15 4v16" /></>;
    case "pitch-snap":
      return <><path d="M5 4v8a7 7 0 0 0 14 0V4" /><path d="M5 4h5M14 4h5" /><path d="M5 8h5M14 8h5" /><path d="M10 4v8a2 2 0 0 0 4 0V4" /></>;
    case "pitch-guide":
      return <><path d="M10 2a8 8 0 1 0 0 16h1.2a1.8 1.8 0 0 0 0-3.6h-.6a1.3 1.3 0 0 1 0-2.6H13A5 5 0 0 0 18 7c0-2.8-3.6-5-8-5Z" /><circle cx="6" cy="7" r="1" /><circle cx="9.5" cy="5" r="1" /><circle cx="13" cy="6.5" r="1" /></>;
    case "pitch-color":
      return <><path d="M9.44444 4.44444L12.3917 0.760432C12.7762 0.279794 13.3583 0 13.9738 0C15.0929 0 16 0.907148 16 2.02617C16 2.64169 15.7202 3.22383 15.2396 3.60835L11.5556 6.55556L12.2454 7.24538C12.7286 7.72855 13 8.38388 13 9.0672C13 9.66992 12.7887 10.2536 12.4028 10.7166L11.8246 11.4104L4.58957 4.17536L5.2834 3.59717C5.74643 3.21131 6.33008 3 6.9328 3C7.61612 3 8.27145 3.27145 8.75462 3.75462L9.44444 4.44444Z" /><path d="M0 8L3.04679 5.46101L10.539 12.9532L8 16L0 8Z" /></>;
    case "labels":
      return <><path d="M5 18 10 6l5 12M7 14h6M16 8h4m-2-2v4" /></>;
    case "auto-fit":
      return <><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></>;
  }
}
