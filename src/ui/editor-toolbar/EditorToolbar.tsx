import React from "react";
import {
  MAXIMUM_MEASURE_COUNT,
  MINIMUM_MEASURE_COUNT,
} from "../../domain/clips/clip";
import type {
  SelectionTransformationKind,
} from "../../domain/selection-transformations";
import type {
  SelectionMode,
} from "../../editor/interactions/gestures/gesture-draft";
import type {
  NoteColorMode,
} from "../../editor/model/note-color-mode";

export interface EditorToolbarProps {
  readonly inspectorOpen: boolean;
  readonly inspectorSection: "instruments" | "clips";
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly measureCount: number;
  readonly selectionAvailable: boolean;
  readonly noteSelectionAvailable: boolean;
  readonly clipboardSelectionAvailable: boolean;
  readonly clipboardAvailable: boolean;
  readonly selectionMode: SelectionMode;
  readonly noteColorMode: NoteColorMode;
  readonly onToggleInspector: (section: "instruments" | "clips") => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onManageMeasures: () => void;
  readonly onRemoveMeasure: () => void;
  readonly onDeleteSelection: () => void;
  readonly onToggleSelectionEnabled: () => void;
  readonly onCopy: () => void;
  readonly onCut: () => void;
  readonly onPaste: () => void;
  readonly onSelectionModeChange: (mode: SelectionMode) => void;
  readonly onNoteColorModeToggle: () => void;
  readonly onOpenSliceSelection: () => void;
  readonly onAddMarkerAtPlayhead: () => void;
  readonly onTransformSelection: (
    kind: SelectionTransformationKind,
    label: string,
  ) => void;
}

export function EditorToolbar({
  inspectorOpen: projectInspectorOpen,
  inspectorSection,
  canUndo,
  canRedo,
  measureCount,
  selectionAvailable,
  noteSelectionAvailable,
  clipboardSelectionAvailable,
  clipboardAvailable,
  selectionMode,
  noteColorMode,
  onToggleInspector,
  onUndo,
  onRedo,
  onManageMeasures,
  onRemoveMeasure,
  onDeleteSelection,
  onToggleSelectionEnabled,
  onCopy,
  onCut,
  onPaste,
  onSelectionModeChange,
  onNoteColorModeToggle,
  onOpenSliceSelection,
  onAddMarkerAtPlayhead,
  onTransformSelection,
}: EditorToolbarProps): React.JSX.Element {
  return (
  <div className="editor-toolbar">
    <div className="editor-toolbar-actions">
      <div className="inspector-toggle-group">
        <button
          className={
            `project-inspector-toggle-button${
              projectInspectorOpen && inspectorSection === "instruments"
                ? " is-active"
                : ""
            }`
          }
          type="button"
          aria-label="Open instruments"
          title="Instruments"
          aria-expanded={
            projectInspectorOpen && inspectorSection === "instruments"
          }
          aria-controls="project-inspector"
          onClick={() => onToggleInspector("instruments")}
        >
          <svg className="inspector-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" />
            <path d="M7.5 5v14M12 5v14M16.5 5v14" />
            <path
              className="keyboard-black-keys"
              d="M6.2 5h2.6v7H6.2zM10.7 5h2.6v7h-2.6zM15.2 5h2.6v7h-2.6z"
            />
          </svg>
        </button>
        <button
          className={
            `project-inspector-toggle-button${
              projectInspectorOpen && inspectorSection === "clips"
                ? " is-active"
                : ""
            }`
          }
          type="button"
          aria-label="Open clips"
          title="Clips"
          aria-expanded={
            projectInspectorOpen && inspectorSection === "clips"
          }
          aria-controls="project-inspector"
          onClick={() => onToggleInspector("clips")}
        >
          <svg className="inspector-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 7h7l2-2h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
            <path d="M3 9h18" />
          </svg>
        </button>
      </div>
      <div
        className="edit-tool-group"
        role="toolbar"
        aria-label="Edit commands"
      >
        <button
          type="button"
          title="Undo"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 7-5 5 5 5" />
            <path d="M5 12h8a6 6 0 0 1 6 6" />
          </svg>
        </button>
        <button
          type="button"
          title="Redo"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 7 5 5-5 5" />
            <path d="M19 12h-8a6 6 0 0 0-6 6" />
          </svg>
        </button>
        <button
          type="button"
          title="Add marker at playhead"
          aria-label="Add marker at playhead"
          onClick={onAddMarkerAtPlayhead}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
             <path d="M5 21V3h9l2 3h5v9h-6l-2-3H7v9H5Z" />
          </svg>
        </button>
        <button
          type="button"
          title="Add measures..."
          aria-label="Add measures..."
          disabled={
            measureCount
            >= MAXIMUM_MEASURE_COUNT
          }
          onClick={onManageMeasures}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4v16M11 4v16" />
            <path d="M15 12h6M18 9v6" />
          </svg>
        </button>
        <button
          type="button"
          title="Remove the measure at the playhead"
          aria-label="Remove the measure at the playhead"
          disabled={
            measureCount
            <= MINIMUM_MEASURE_COUNT
          }
          onClick={onRemoveMeasure}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4v16M11 4v16" />
            <path d="M15 12h6" />
          </svg>
        </button>
        <button
          className="delete-notes-button"
          type="button"
          title="Delete selected notes and markers"
          aria-label="Delete selected notes and markers"
          disabled={!selectionAvailable}
          onClick={onDeleteSelection}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16" />
            <path d="m9 7 .7-2h4.6l.7 2" />
            <path d="m6.5 7 .8 13h9.4l.8-13" />
            <path d="M10 11v5M14 11v5" />
          </svg>
        </button>
        <button
          type="button"
          title="Enable or disable selected notes"
          aria-label="Enable or disable selected notes"
          disabled={!noteSelectionAvailable}
          onClick={onToggleSelectionEnabled}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5 15 4v11.5M15 7.5 8 9v8" />
            <ellipse cx="5.5" cy="17" rx="2.5" ry="2" />
            <ellipse cx="12.5" cy="15.5" rx="2.5" ry="2" />
            <path d="M4 4l16 16" />
          </svg>
        </button>
        <button
          type="button"
          title="Copy selected notes and markers"
          aria-label="Copy selected notes and markers"
          disabled={!clipboardSelectionAvailable}
          onClick={onCopy}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="8" y="8" width="11" height="11" rx="2" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </svg>
        </button>
        <button
          type="button"
          title="Cut selected notes and markers"
          aria-label="Cut selected notes and markers"
          disabled={!clipboardSelectionAvailable}
          onClick={onCut}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="6" cy="7" r="3" />
            <circle cx="6" cy="17" r="3" />
            <path d="m8.7 8.4 10.3 6.2" />
            <path d="m8.7 15.6 10.3-6.2" />
          </svg>
        </button>
        <button
          type="button"
          title="Paste notes and markers at the playhead"
          aria-label="Paste notes and markers at the playhead"
          disabled={
            !clipboardAvailable
          }
          onClick={onPaste}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5h6" />
            <path d="M10 3h4a2 2 0 0 1 2 2v2H8V5a2 2 0 0 1 2-2Z" />
            <path d="M8 5H6a2 2 0 0 0-2 2v13h12" />
            <rect x="10" y="9" width="10" height="11" rx="2" />
          </svg>
        </button>

        <button
          className={
            `selection-mode-button${
              selectionMode === "replace"
                ? " is-active"
                : ""
            }`
          }
          type="button"
          title="Replace selection"
          aria-label="Replace selection"
          aria-pressed={selectionMode === "replace"}
          onClick={() => onSelectionModeChange("replace")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect
              className="selection-mode-boundary"
              x="4"
              y="4"
              width="16"
              height="16"
              rx="2"
            />
            <rect x="8" y="8" width="8" height="8" rx="1" />
          </svg>
        </button>
        <button
          className={
            `selection-mode-button${
              selectionMode === "add"
                ? " is-active"
                : ""
            }`
          }
          type="button"
          title="Add to selection"
          aria-label="Add to selection"
          aria-pressed={selectionMode === "add"}
          onClick={() => onSelectionModeChange("add")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect
              className="selection-mode-boundary"
              x="4"
              y="4"
              width="16"
              height="16"
              rx="2"
            />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </button>
        <button
          className={
            `selection-mode-button${
              selectionMode === "subtract"
                ? " is-active"
                : ""
            }`
          }
          type="button"
          title="Subtract from selection"
          aria-label="Subtract from selection"
          aria-pressed={selectionMode === "subtract"}
          onClick={() => onSelectionModeChange("subtract")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect
              className="selection-mode-boundary"
              x="4"
              y="4"
              width="16"
              height="16"
              rx="2"
            />
            <path d="M8 12h8" />
          </svg>
        </button>
        <button
          type="button"
          title="Slice selected notes..."
          aria-label="Choose how to slice selected notes"
          disabled={!noteSelectionAvailable}
          onClick={onOpenSliceSelection}
        >
          <svg
            className="slice-tool-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M2.5 21.5 11 10l4 4-12.5 7.5Z" />
            <path
              className="slice-tool-handle"
              d="m10.3 9.3 6.1-6.1a1.5 1.5 0 0 1 2.1 0l2.3 2.3a1.5 1.5 0 0 1 0 2.1l-6.1 6.1Z"
            />
          </svg>
        </button>
        <button
          type="button"
          title="Invert selected intervals"
          aria-label="Invert selected intervals"
          disabled={!noteSelectionAvailable}
          onClick={() => {
            onTransformSelection(
              "invert",
              "Invert selected intervals",
            );
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              className="horizontal-symmetry-triangle"
              d="M5 3h14l-7 7Z"
            />
            <path
              className="horizontal-symmetry-axis"
              d="M3 12h18"
            />
            <path
              className="horizontal-symmetry-triangle"
              d="M5 21h14l-7-7Z"
            />
          </svg>
        </button>
        <button
          type="button"
          title="Retrograde selected motif"
          aria-label="Retrograde selected motif"
          disabled={!noteSelectionAvailable}
          onClick={() => {
            onTransformSelection(
              "retrograde",
              "Retrograde selected motif",
            );
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <g transform="rotate(90 12 12)">
              <path
                className="horizontal-symmetry-triangle"
                d="M5 3h14l-7 7Z"
              />
              <path
                className="horizontal-symmetry-axis"
                d="M3 12h18"
              />
              <path
                className="horizontal-symmetry-triangle"
                d="M5 21h14l-7-7Z"
              />
            </g>
          </svg>
        </button>
        <button
          type="button"
          title="Augment selected motif"
          aria-label="Augment selected motif"
          disabled={!noteSelectionAvailable}
          onClick={() => {
            onTransformSelection(
              "augment",
              "Augment selected motif",
            );
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 11.5H2M2 11.5l2.5-2.5M2 11.5 4.5 14M18 11.5h5M23 11.5 20.5 9M23 11.5 20.5 14" />
            <path d="M15 4.5v10.2" />
            <ellipse
              className="transformation-note-head"
              cx="11.8"
              cy="16"
              rx="3.2"
              ry="2.2"
              transform="rotate(-20 11.8 16)"
            />
          </svg>
        </button>
        <button
          type="button"
          title="Diminish selected motif"
          aria-label="Diminish selected motif"
          disabled={!noteSelectionAvailable}
          onClick={() => {
            onTransformSelection(
              "diminish",
              "Diminish selected motif",
            );
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2 11.5h5M4.5 9 7 11.5 4.5 14M23 11.5h-5M20.5 9 18 11.5l2.5 2.5" />
            <path d="M15 4.5v10.2" />
            <ellipse
              className="transformation-note-head"
              cx="11.8"
              cy="16"
              rx="3.2"
              ry="2.2"
              transform="rotate(-20 11.8 16)"
            />
          </svg>
        </button>
        <button
          className={
            `note-color-toggle${
              noteColorMode === "instrument" ? " is-instrument-mode" : ""
            }`
          }
          type="button"
          title={
            noteColorMode === "instrument"
              ? "Use pitch colors"
              : "Use instrument colors"
          }
          aria-label="Color notes by instrument"
          aria-pressed={noteColorMode === "instrument"}
          onClick={onNoteColorModeToggle}
        >
          <svg
            className="note-color-brush-icon"
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <path d="M9.44444 4.44444L12.3917 0.760432C12.7762 0.279794 13.3583 0 13.9738 0C15.0929 0 16 0.907148 16 2.02617C16 2.64169 15.7202 3.22383 15.2396 3.60835L11.5556 6.55556L12.2454 7.24538C12.7286 7.72855 13 8.38388 13 9.0672C13 9.66992 12.7887 10.2536 12.4028 10.7166L11.8246 11.4104L4.58957 4.17536L5.2834 3.59717C5.74643 3.21131 6.33008 3 6.9328 3C7.61612 3 8.27145 3.27145 8.75462 3.75462L9.44444 4.44444Z" />
            <path d="M0 8L3.04679 5.46101L10.539 12.9532L8 16L0 8Z" />
          </svg>
        </button>
      </div>
    </div>
  </div>

  );
}
