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
  ProjectMenu,
} from "../project-files/ProjectMenu";
import {
  TransportControls,
} from "../transport/TransportControls";
import type {
  ProjectSaveStatus,
} from "../../use-cases/persistence/project-autosave";

export interface EditorHeaderProps {
  readonly projectState: ProjectState;
  readonly playbackStatus: PlaybackStatus;
  readonly midiInputRef: RefObject<HTMLInputElement | null>;
  readonly saveStatus: ProjectSaveStatus;
  readonly onCloseProject: () => void | Promise<void>;
  readonly onExportProject: () => void;
  readonly onOpenMidiImport: () => void;
  readonly onExportMidi: () => void;
  readonly onMidiFileChange: (
    event: ChangeEvent<HTMLInputElement>,
  ) => void | Promise<void>;
  readonly onProjectTitleCommit: (input: HTMLInputElement) => void;
  readonly onReturnToStart: () => void;
  readonly onTogglePlayback: () => void;
  readonly onToggleLoop: () => void;
  readonly onPreviewMasterGain: (gain: number) => void;
  readonly onMasterGainCommit: (gain: number) => void;
  readonly onMasterMuteToggle: () => void;
  readonly onMasterTuningCommit: (tuningFrequencyHz: number) => void;
}

export function EditorHeader({
  projectState,
  playbackStatus,
  midiInputRef: importMidiInputRef,
  saveStatus,
  onCloseProject: handleCloseProject,
  onExportProject: handleExportProject,
  onOpenMidiImport: handleOpenMidiImport,
  onExportMidi: handleExportMidi,
  onMidiFileChange: handleMidiFileChange,
  onProjectTitleCommit: handleProjectTitleCommit,
  onReturnToStart: returnToStart,
  onTogglePlayback: togglePlayback,
  onToggleLoop: handleToggleLoop,
  onPreviewMasterGain: previewMasterGain,
  onMasterGainCommit: handleMasterGainCommit,
  onMasterMuteToggle: handleMasterMuteToggle,
  onMasterTuningCommit: handleMasterTuningCommit,
}: EditorHeaderProps): React.JSX.Element {
  const activeClip = getActiveClip(projectState);
  const saveStatusLabel = formatSaveStatus(saveStatus);

  return (
    <header className="app-header">
      <section
        className="left"
        aria-label="Project actions and transport"
      >
        <ProjectMenu
          midiInputRef={importMidiInputRef}
          onReturnHome={handleCloseProject}
          onExportProject={handleExportProject}
          onOpenMidiImport={handleOpenMidiImport}
          onExportMidi={handleExportMidi}
          onMidiFileChange={handleMidiFileChange}
        />
        <TransportControls
          status={playbackStatus}
          loopEnabled={
            activeClip.transportSettings.loopEnabled
          }
          onReturnToStart={returnToStart}
          onTogglePlayback={togglePlayback}
          onToggleLoop={handleToggleLoop}
        />
        <span
          className={`project-save-status is-${saveStatus.state}`}
          role={saveStatus.state === "error" ? "alert" : "status"}
          aria-label={saveStatusLabel}
          title={saveStatus.state === "error"
            ? `${saveStatusLabel}: ${saveStatus.error.message}`
            : saveStatusLabel}
        />
      </section>

      <section
        className="center"
        aria-label="Active project"
      >
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
      </section>

      <section className="right" aria-label="Master bus">
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
      </section>
    </header>
  );
}

function formatSaveStatus(status: ProjectSaveStatus): string {
  switch (status.state) {
    case "saving":
      return "Saving…";
    case "unsaved":
      return "Unsaved changes";
    case "error":
      return "Autosave failed";
    case "saved":
      return "Saved locally";
  }
}
