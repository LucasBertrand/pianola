import React from "react";
import type {
  PitchSnapSettings,
} from "../../../domain/music-theory/pitch-snap";
import type {
  NoteColorMode,
} from "../../../editor-core/model/note-color-mode";
import type {
  NoteLabelMode,
} from "../../../editor-core/model/note-label-mode";

export interface PitchSnapControlsProps {
  readonly settings: PitchSnapSettings;
  readonly noteColorMode: NoteColorMode;
  readonly noteLabelMode: NoteLabelMode;
  readonly onNoteColorModeToggle: () => void;
  readonly onNoteLabelModeChange: (mode: NoteLabelMode) => void;
  readonly onSettingsChange: (
    changes: Partial<PitchSnapSettings>,
  ) => void;
}

export function PitchSnapControls({
  settings,
  noteColorMode,
  noteLabelMode,
  onNoteColorModeToggle,
  onNoteLabelModeChange,
  onSettingsChange,
}: PitchSnapControlsProps): React.JSX.Element {
  return (
    <div
      className={`pitch-snap-control${settings.enabled ? " is-snap-active" : ""}${settings.visualGuideEnabled ? " is-guide-active" : ""}`}
    >
      <button
        className={`pitch-snap-toggle${settings.enabled ? " is-active" : ""}`}
        type="button"
        title={settings.enabled ? "Disable pitch-pattern snapping" : "Enable pitch-pattern snapping"}
        aria-label={settings.enabled ? "Disable pitch-pattern snapping" : "Enable pitch-pattern snapping"}
        aria-pressed={settings.enabled}
        onClick={() => {
          onSettingsChange({ enabled: !settings.enabled });
        }}
      >
        <svg
          className="pitch-snap-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M5 4v8a7 7 0 0 0 14 0V4" />
          <path d="M5 4h5M14 4h5" />
          <path d="M5 8h5M14 8h5" />
          <path d="M10 4v8a2 2 0 0 0 4 0V4" />
        </svg>
      </button>
      <button
        className={`pitch-snap-toggle${settings.visualGuideEnabled ? " is-active" : ""}`}
        type="button"
        title={settings.visualGuideEnabled ? "Hide pitch-pattern guide" : "Show pitch-pattern guide"}
        aria-label={settings.visualGuideEnabled ? "Hide pitch-pattern guide" : "Show pitch-pattern guide"}
        aria-pressed={settings.visualGuideEnabled}
        onClick={() => {
          onSettingsChange({
            visualGuideEnabled: !settings.visualGuideEnabled,
          });
        }}
      >
        <svg
          className="pitch-snap-icon"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M10 2a8 8 0 1 0 0 16h1.2a1.8 1.8 0 0 0 0-3.6h-.6a1.3 1.3 0 0 1 0-2.6H13A5 5 0 0 0 18 7c0-2.8-3.6-5-8-5Z" />
          <circle cx="6" cy="7" r="1" />
          <circle cx="9.5" cy="5" r="1" />
          <circle cx="13" cy="6.5" r="1" />
        </svg>
      </button>      
      <button
        className={`pitch-snap-toggle note-color-toggle${noteColorMode === "pitch" ? " is-active" : ""}`}
        type="button"
        title={
          noteColorMode === "pitch"
            ? "Use instrument colors"
            : "Use pitch colors"
        }
        aria-label="Color notes by pitch"
        aria-pressed={noteColorMode === "pitch"}
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
      <label className="note-label-mode-control">
        <select
          aria-label="Note label display"
          value={noteLabelMode}
          onChange={(event) => {
            onNoteLabelModeChange(event.currentTarget.value as NoteLabelMode);
          }}
        >
          <option value="pitch">Pitch</option>
          <option value="degree">Degree</option>
        </select>
      </label> 
    </div>
  );
}
