import React from "react";
import type {
  PlaybackStatus,
} from "../../application/ports/audio-transport";
import {
  TransportControls,
} from "../transport/TransportControls";

export interface EditorTransportControlsProps {
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

export function EditorTransportControls({
  status,
  loopEnabled,
  autoAdvanceEnabled,
  autoScrollEnabled,
  onReturnToStart,
  onTogglePlayback,
  onToggleLoop,
  onToggleAutoAdvance,
  onToggleAutoScroll,
}: EditorTransportControlsProps): React.JSX.Element {
  return (
    <TransportControls
      status={status}
      loopEnabled={loopEnabled}
      autoAdvanceEnabled={autoAdvanceEnabled}
      autoScrollEnabled={autoScrollEnabled}
      onReturnToStart={onReturnToStart}
      onTogglePlayback={onTogglePlayback}
      onToggleLoop={onToggleLoop}
      onToggleAutoAdvance={onToggleAutoAdvance}
      onToggleAutoScroll={onToggleAutoScroll}
    />
  );
}
