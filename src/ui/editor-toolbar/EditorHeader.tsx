import React, {
  type ChangeEvent,
  type RefObject,
} from "react";
import type {
  PlaybackStatus,
} from "../../audio/playback-model";
import {
  getActiveClip,
  type ProjectState,
} from "../../domain/project/project-document";
import {
  MAXIMUM_NATIVE_PROJECT_TITLE_LENGTH,
} from "../../project-io/native/version";
import {
  MasterGainControl,
} from "../transport/MasterGainControl";
import {
  ProjectFileMenu,
} from "../project-files/ProjectFileMenu";
import {
  TransportControls,
} from "../transport/TransportControls";

export interface EditorHeaderProps {
  readonly projectState: ProjectState;
  readonly playbackStatus: PlaybackStatus;
  readonly projectInputRef: RefObject<HTMLInputElement | null>;
  readonly midiInputRef: RefObject<HTMLInputElement | null>;
  readonly onNewProject: () => void;
  readonly onSaveProject: () => void;
  readonly onOpenProject: () => void;
  readonly onOpenMidiImport: () => void;
  readonly onExportMidi: () => void;
  readonly onProjectFileChange: (
    event: ChangeEvent<HTMLInputElement>,
  ) => void | Promise<void>;
  readonly onMidiFileChange: (
    event: ChangeEvent<HTMLInputElement>,
  ) => void | Promise<void>;
  readonly onProjectTitleCommit: (input: HTMLInputElement) => void;
  readonly onReturnToStart: () => void;
  readonly onTogglePlayback: () => void;
  readonly onStopPlayback: () => void;
  readonly onToggleLoop: () => void;
  readonly onPreviewMasterGain: (gain: number) => void;
  readonly onMasterGainCommit: (gain: number) => void;
  readonly onMasterMuteToggle: () => void;
  readonly onMasterTuningCommit: (tuningFrequencyHz: number) => void;
}

export function EditorHeader({
  projectState,
  playbackStatus,
  projectInputRef: loadProjectInputRef,
  midiInputRef: importMidiInputRef,
  onNewProject: handleNewProject,
  onSaveProject: handleSaveProject,
  onOpenProject: handleOpenProject,
  onOpenMidiImport: handleOpenMidiImport,
  onExportMidi: handleExportMidi,
  onProjectFileChange: handleProjectFileChange,
  onMidiFileChange: handleMidiFileChange,
  onProjectTitleCommit: handleProjectTitleCommit,
  onReturnToStart: returnToStart,
  onTogglePlayback: togglePlayback,
  onStopPlayback: stopPlayback,
  onToggleLoop: handleToggleLoop,
  onPreviewMasterGain: previewMasterGain,
  onMasterGainCommit: handleMasterGainCommit,
  onMasterMuteToggle: handleMasterMuteToggle,
  onMasterTuningCommit: handleMasterTuningCommit,
}: EditorHeaderProps): React.JSX.Element {
  const activeClip = getActiveClip(projectState);

  return (
  <header className="topbar">
    <div className="topbar-left">
      <ProjectFileMenu
        projectInputRef={loadProjectInputRef}
        midiInputRef={importMidiInputRef}
        onNewProject={handleNewProject}
        onSaveProject={handleSaveProject}
        onOpenProject={handleOpenProject}
        onOpenMidiImport={handleOpenMidiImport}
        onExportMidi={handleExportMidi}
        onProjectFileChange={handleProjectFileChange}
        onMidiFileChange={handleMidiFileChange}
      />
      <TransportControls
        status={playbackStatus}
        loopEnabled={
          activeClip.transportSettings.loopEnabled
        }
        onReturnToStart={returnToStart}
        onTogglePlayback={togglePlayback}
        onStop={stopPlayback}
        onToggleLoop={handleToggleLoop}
      />
    </div>

    <div className="topbar-center">
      <input
        key={projectState.title}
        className="project-title-input"
        type="text"
        maxLength={MAXIMUM_NATIVE_PROJECT_TITLE_LENGTH}
        defaultValue={projectState.title}
        aria-label="Project title"
        onBlur={(event) => {
          handleProjectTitleCommit(event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
    </div>

    <MasterGainControl
      gain={projectState.masterBus.gain}
      muted={projectState.masterBus.muted}
      tuningFrequencyHz={
        projectState.masterBus.tuningFrequencyHz
      }
      onPreview={previewMasterGain}
      onCommit={handleMasterGainCommit}
      onMuteToggle={handleMasterMuteToggle}
      onTuningCommit={handleMasterTuningCommit}
    />
  </header>
  );
}
