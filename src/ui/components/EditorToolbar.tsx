import React from "react";
import {
  APPLICATION_COLORS,
} from "../../config/application-colors";
import {
  MAXIMUM_MEASURE_COUNT,
  MINIMUM_MEASURE_COUNT,
  type ProjectInstrument,
} from "../../domain/model";
import type {
  SelectionTransformationKind,
} from "../../domain/selection-transformations";
import type {
  SelectionMode,
} from "../../interaction/core/state";
import type {
  NoteColorMode,
} from "../rendering/note-style";

export interface EditorToolbarProps {
  readonly inspectorOpen: boolean;
  readonly inspectorSection: "instruments" | "clips";
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly measureCount: number;
  readonly selectionAvailable: boolean;
  readonly clipboardAvailable: boolean;
  readonly selectionMode: SelectionMode;
  readonly noteColorMode: NoteColorMode;
  readonly selectedInstrument: {
    readonly color: ProjectInstrument["color"];
    readonly locked: boolean;
  } | undefined;
  readonly onToggleInspector: (section: "instruments" | "clips") => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onInsertMeasure: () => void;
  readonly onRemoveMeasure: () => void;
  readonly onDeleteSelection: () => void;
  readonly onToggleSelectionEnabled: () => void;
  readonly onCopy: () => void;
  readonly onCut: () => void;
  readonly onPaste: () => void;
  readonly onSelectionModeChange: (mode: SelectionMode) => void;
  readonly onNoteColorModeToggle: () => void;
  readonly onTransferSelectionToInstrument: () => void;
  readonly onSliceSelectionAtPlayhead: () => void;
  readonly onTransformSelection: (
    kind: SelectionTransformationKind,
    label: string,
  ) => void;
}

export function EditorToolbar({
  inspectorOpen: generalInspectorOpen,
  inspectorSection,
  canUndo,
  canRedo,
  measureCount,
  selectionAvailable,
  clipboardAvailable,
  selectionMode,
  noteColorMode,
  selectedInstrument,
  onToggleInspector,
  onUndo,
  onRedo,
  onInsertMeasure,
  onRemoveMeasure,
  onDeleteSelection,
  onToggleSelectionEnabled,
  onCopy,
  onCut,
  onPaste,
  onSelectionModeChange,
  onNoteColorModeToggle,
  onTransferSelectionToInstrument,
  onSliceSelectionAtPlayhead,
  onTransformSelection,
}: EditorToolbarProps): React.JSX.Element {
  return (
  <div className="editor-toolbar">
    <div className="editor-toolbar-actions">
      <div className="inspector-toggle-group">
        <button
          className="general-inspector-toggle-button"
          type="button"
          aria-label="Open instruments"
          title="Instruments"
          aria-expanded={
            generalInspectorOpen && inspectorSection === "instruments"
          }
          aria-controls="general-inspector"
          onClick={() => onToggleInspector("instruments")}
        >
          <svg className="inspector-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 4v16M12 4v16M18 4v16" />
            <circle cx="6" cy="9" r="2" />
            <circle cx="12" cy="15" r="2" />
            <circle cx="18" cy="7" r="2" />
          </svg>
        </button>
        <button
          className="general-inspector-toggle-button"
          type="button"
          aria-label="Open clips"
          title="Clips"
          aria-expanded={
            generalInspectorOpen && inspectorSection === "clips"
          }
          aria-controls="general-inspector"
          onClick={() => onToggleInspector("clips")}
        >
          <svg className="inspector-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="5" width="13" height="6" rx="2" />
            <rect x="7" y="13" width="13" height="6" rx="2" />
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
          title="Insert a measure before the playhead measure"
          aria-label="Insert a measure before the playhead measure"
          disabled={
            measureCount
            >= MAXIMUM_MEASURE_COUNT
          }
          onClick={onInsertMeasure}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
            <path d="M8 5v14M11 12h6M14 9v6" />
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
            <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
            <path d="M8 5v14M11 12h6" />
          </svg>
        </button>
        <button
          className="delete-notes-button"
          type="button"
          title="Delete selected notes"
          aria-label="Delete selected notes"
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
          disabled={!selectionAvailable}
          onClick={onToggleSelectionEnabled}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 4v11.5M15 7.5 8 9v8" />
            <ellipse cx="5.5" cy="17" rx="2.5" ry="2" />
            <ellipse cx="12.5" cy="15.5" rx="2.5" ry="2" />
            <path d="M4 4l16 16" />
          </svg>
        </button>
        <button
          type="button"
          title="Copy selected notes"
          aria-label="Copy selected notes"
          disabled={!selectionAvailable}
          onClick={onCopy}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="8" y="8" width="11" height="11" rx="2" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </svg>
        </button>
        <button
          type="button"
          title="Cut selected notes"
          aria-label="Cut selected notes"
          disabled={!selectionAvailable}
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
          title="Paste notes at the playhead"
          aria-label="Paste notes at the playhead"
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
            <rect x="4" y="4" width="16" height="16" rx="2" />
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
            <rect x="4" y="4" width="16" height="16" rx="2" />
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
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path d="M8 12h8" />
          </svg>
        </button>
        <button
          className="instrument-transfer-button"
          type="button"
          title="Move selected notes to the selected instrument"
          aria-label="Move selected notes to the selected instrument"
          disabled={
            !selectionAvailable
            || selectedInstrument === undefined
            || selectedInstrument.locked
          }
          style={{
            color:
              selectedInstrument?.color
              ?? APPLICATION_COLORS.neutral.textDisabled,
          }}
          onClick={onTransferSelectionToInstrument}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h7M4 12h7M4 18h7" />
            <path d="M13 12h7M17 8l4 4-4 4" />
          </svg>
        </button>
        <button
          type="button"
          title="Slice selected notes at the playhead"
          aria-label="Slice selected notes at the playhead"
          disabled={!selectionAvailable}
          onClick={onSliceSelectionAtPlayhead}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m4 16 11-11 5 5L9 21H4Z" />
            <path d="m12.5 7.5 4 4M4 16h5v5" />
            <path d="M15 5 17.5 2.5 22 7l-2 3" />
          </svg>
        </button>
        <button
          type="button"
          title="Invert selected intervals"
          aria-label="Invert selected intervals"
          disabled={!selectionAvailable}
          onClick={() => {
            onTransformSelection(
              "invert",
              "Invert selected intervals",
            );
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2.5 18 8 6.5" />
            <circle cx="2.5" cy="18" r="1.5" />
            <circle cx="8" cy="6.5" r="1.5" />
            <path d="M10.5 12h3M12 10.5l1.5 1.5-1.5 1.5" />
            <path d="m16 6.5 5.5 11.5" />
            <circle cx="16" cy="6.5" r="1.5" />
            <circle cx="21.5" cy="18" r="1.5" />
          </svg>
        </button>
        <button
          type="button"
          title="Retrograde selected motif"
          aria-label="Retrograde selected motif"
          disabled={!selectionAvailable}
          onClick={() => {
            onTransformSelection(
              "retrograde",
              "Retrograde selected motif",
            );
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="5" width="4" height="6" rx="1" />
            <rect x="10" y="7" width="4" height="4" rx="1" />
            <rect x="16" y="3" width="4" height="8" rx="1" />
            <path d="M20 18H4M8 14l-4 4 4 4" />
          </svg>
        </button>
        <button
          type="button"
          title="Augment selected motif"
          aria-label="Augment selected motif"
          disabled={!selectionAvailable}
          onClick={() => {
            onTransformSelection(
              "augment",
              "Augment selected motif",
            );
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="7" height="5" rx="1" />
            <path d="M12 6.5h5M15 4l2.5 2.5L15 9" />
            <rect x="3" y="15" width="18" height="5" rx="1" />
            <path d="M7 12h10" strokeDasharray="1.5 2" />
          </svg>
        </button>
        <button
          type="button"
          title="Diminish selected motif"
          aria-label="Diminish selected motif"
          disabled={!selectionAvailable}
          onClick={() => {
            onTransformSelection(
              "diminish",
              "Diminish selected motif",
            );
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="5" rx="1" />
            <path d="M17.5 12h-5M15 9.5 12.5 12l2.5 2.5" />
            <rect x="3" y="15" width="7" height="5" rx="1" />
            <path d="M7 12h3" strokeDasharray="1.5 2" />
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
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 2a8 8 0 1 0 0 16h1.2a1.8 1.8 0 0 0 0-3.6h-.6a1.3 1.3 0 0 1 0-2.6H13A5 5 0 0 0 18 7c0-2.8-3.6-5-8-5Z" />
            <circle cx="6" cy="7" r="1" />
            <circle cx="9.5" cy="5" r="1" />
            <circle cx="13" cy="6.5" r="1" />
          </svg>
        </button>
      </div>
    </div>
  </div>

  );
}
