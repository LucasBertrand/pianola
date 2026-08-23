import React from "react";
import type {
  PlaybackStatus,
} from "../../audio/playback-model";
import {
  isStopAtEndEnabled,
} from "./transport-control-state";

export interface TransportControlsProps {
  readonly status: PlaybackStatus;
  readonly loopEnabled: boolean;
  readonly autoAdvanceEnabled: boolean;
  readonly autoScrollEnabled: boolean;
  readonly onReturnToStart: () => void;
  readonly onTogglePlayback: () => void;
  readonly onToggleLoop: () => void;
  readonly onToggleAutoAdvance: () => void;
  readonly onToggleAutoScroll: () => void;
}

export function TransportControls({
  status,
  loopEnabled,
  autoAdvanceEnabled,
  autoScrollEnabled,
  onReturnToStart,
  onTogglePlayback,
  onToggleLoop,
  onToggleAutoAdvance,
  onToggleAutoScroll,
}: TransportControlsProps): React.JSX.Element {
  const playing = status === "playing";
  const stopAtEndEnabled = isStopAtEndEnabled(autoAdvanceEnabled);

  return (
    <div
      className="transport-controls"
      role="group"
      aria-label="Transport preview"
    >
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
          <path d="M20 11A8 8 0 0 0 5.4 6.5" />
          <path d="M5.4 3v3.5h3.5" />
          <path d="M4 13a8 8 0 0 0 14.6 4.5" />
          <path d="M18.6 21v-3.5h-3.5" />
        </svg>
      </button>
      <button
        className={
          `icon-button auto-advance-toggle-button${
            stopAtEndEnabled ? " is-active" : ""
          }`
        }
        type="button"
        title={stopAtEndEnabled
          ? "Continue to the next clip after every clip"
          : "Stop playback at the end of every clip"}
        aria-label={stopAtEndEnabled
          ? "Continue to the next clip after every clip"
          : "Stop playback at the end of every clip"}
        aria-pressed={stopAtEndEnabled}
        onClick={onToggleAutoAdvance}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12h12" />
          <path d="m12 7 5 5-5 5" />
          <path d="M20 6v12" />
        </svg>
      </button>
      <button
        className={
          `icon-button auto-scroll-toggle-button${
            autoScrollEnabled ? " is-active" : ""
          }`
        }
        type="button"
        title={autoScrollEnabled
          ? "Disable playhead auto-scroll"
          : "Enable playhead auto-scroll"}
        aria-label={autoScrollEnabled
          ? "Disable playhead auto-scroll"
          : "Enable playhead auto-scroll"}
        aria-pressed={autoScrollEnabled}
        onClick={onToggleAutoScroll}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v16" />
          <path d="M8 7 5 12l3 5" />
          <path d="m16 7 3 5-3 5" />
        </svg>
      </button>
    </div>
  );
}
