import React from "react";
import type {
  PlaybackStatus,
} from "../../audio/playback-model";

export interface TransportControlsProps {
  readonly status: PlaybackStatus;
  readonly loopEnabled: boolean;
  readonly onReturnToStart: () => void;
  readonly onTogglePlayback: () => void;
  readonly onStop: () => void;
  readonly onToggleLoop: () => void;
}

export function TransportControls({
  status,
  loopEnabled,
  onReturnToStart,
  onTogglePlayback,
  onStop,
  onToggleLoop,
}: TransportControlsProps): React.JSX.Element {
  const playing = status === "playing";

  return (
    <div className="transport-cluster" aria-label="Transport preview">
      <button
        className="icon-button"
        type="button"
        title="Return to start"
        aria-label="Return to start"
        onClick={onReturnToStart}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 5v14" />
          <path d="m18 6-8 6 8 6Z" />
        </svg>
      </button>
      <button
        className={`play-button${playing ? " is-playing" : ""}`}
        type="button"
        title={playing ? "Pause" : "Play"}
        aria-label={playing ? "Pause" : "Play"}
        aria-pressed={playing}
        onClick={onTogglePlayback}
      >
        {playing ? (
          <svg
            className="pause-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <rect x="7" y="5.5" width="3.5" height="13" rx="1" />
            <rect x="13.5" y="5.5" width="3.5" height="13" rx="1" />
          </svg>
        ) : (
          <svg
            className="play-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M8 5.75v12.5L18 12Z" />
          </svg>
        )}
      </button>
      <button
        className="icon-button"
        type="button"
        title="Stop"
        aria-label="Stop"
        onClick={onStop}
      >
        <span className="stop-icon" aria-hidden="true" />
      </button>
      <button
        className={
          `icon-button loop-toggle-button${
            loopEnabled ? " is-active" : ""
          }`
        }
        type="button"
        title={loopEnabled ? "Disable loop" : "Enable loop"}
        aria-label={loopEnabled ? "Disable loop" : "Enable loop"}
        aria-pressed={loopEnabled}
        onClick={onToggleLoop}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 7h10a4 4 0 0 1 4 4v1" />
          <path d="m17 9 3 3 3-3" />
          <path d="M18 17H8a4 4 0 0 1-4-4v-1" />
          <path d="m7 15-3-3-3 3" />
        </svg>
      </button>
    </div>
  );
}
