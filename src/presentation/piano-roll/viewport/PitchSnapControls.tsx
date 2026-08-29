import React from "react";
import type {
  PitchSnapSettings,
} from "../../../domain/music-theory/pitch-snap";

export interface PitchSnapControlsProps {
  readonly settings: PitchSnapSettings;
  readonly onSettingsChange: (
    changes: Partial<PitchSnapSettings>,
  ) => void;
}

export function PitchSnapControls({
  settings,
  onSettingsChange,
}: PitchSnapControlsProps): React.JSX.Element {
  return (
    <div
      className={`pitch-snap-control${settings.enabled ? " is-snap-active" : ""}${settings.visualGuideEnabled ? " is-guide-active" : ""}`}
    >
      <button
        className={`pitch-snap-toggle${settings.visualGuideEnabled ? " is-active" : ""}`}
        type="button"
        title={settings.visualGuideEnabled ? "Hide tonal guide" : "Show tonal guide"}
        aria-label={settings.visualGuideEnabled ? "Hide tonal guide" : "Show tonal guide"}
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
        className={`pitch-snap-toggle${settings.enabled ? " is-active" : ""}`}
        type="button"
        title={settings.enabled ? "Disable tonal pitch snapping" : "Enable tonal pitch snapping"}
        aria-label={settings.enabled ? "Disable tonal pitch snapping" : "Enable tonal pitch snapping"}
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
    </div>
  );
}
