import React from "react";
import {
  MasterGainControl,
} from "../transport/MasterGainControl";

export interface EditorMasterBusControlsProps {
  readonly gain: number;
  readonly muted: boolean;
  readonly tuningFrequencyHz: number;
  readonly onPreview: (gain: number) => void;
  readonly onCommit: (gain: number) => void;
  readonly onMuteToggle: () => void;
  readonly onTuningCommit: (tuningFrequencyHz: number) => void;
}

export function EditorMasterBusControls({
  gain,
  muted,
  tuningFrequencyHz,
  onPreview,
  onCommit,
  onMuteToggle,
  onTuningCommit,
}: EditorMasterBusControlsProps): React.JSX.Element {
  return (
    <MasterGainControl
      gain={gain}
      muted={muted}
      tuningFrequencyHz={tuningFrequencyHz}
      onPreview={onPreview}
      onCommit={onCommit}
      onMuteToggle={onMuteToggle}
      onTuningCommit={onTuningCommit}
    />
  );
}
