import React, {
  type ChangeEvent,
  type RefObject,
} from "react";
import type {
  PlaybackStatus,
} from "../../audio/playback-model";
import type {
  Note,
} from "../../domain/notes/note";
import type {
  LoopRegion,
} from "../../domain/transport/transport";
import type {
  ReadonlyRenderSignal,
} from "../../editor/model/render-signal";
import {
  getActiveClip,
  type ProjectState,
} from "../../domain/project/project-document";
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
import {
  detectChordsFromNotes,
} from "../../music/chord-recognition";
import {
  formatLoopDuration,
} from "./editor-context-format";

export interface EditorHeaderProps {
  readonly projectState: ProjectState;
  readonly loopDragPreview: ReadonlyRenderSignal<LoopRegion | null>;
  readonly selectedNotes: readonly Note[];
  readonly selectedMarkerCount: number;
  readonly gridResolutionTicks: number;
  readonly playbackStatus: PlaybackStatus;
  readonly autoScrollEnabled: boolean;
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
  readonly onToggleAutoAdvance: () => void;
  readonly onToggleAutoScroll: () => void;
  readonly onPreviewMasterGain: (gain: number) => void;
  readonly onMasterGainCommit: (gain: number) => void;
  readonly onMasterMuteToggle: () => void;
  readonly onMasterTuningCommit: (tuningFrequencyHz: number) => void;
}

export function EditorHeader({
  projectState,
  loopDragPreview,
  selectedNotes,
  selectedMarkerCount,
  gridResolutionTicks,
  playbackStatus,
  autoScrollEnabled,
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
  onToggleAutoAdvance: handleToggleAutoAdvance,
  onToggleAutoScroll: handleToggleAutoScroll,
  onPreviewMasterGain: previewMasterGain,
  onMasterGainCommit: handleMasterGainCommit,
  onMasterMuteToggle: handleMasterMuteToggle,
  onMasterTuningCommit: handleMasterTuningCommit,
}: EditorHeaderProps): React.JSX.Element {
  const [previewLoop, setPreviewLoop] = React.useState(
    () => loopDragPreview.get(),
  );
  const activeClip = getActiveClip(projectState);
  const saveStatusLabel = formatSaveStatus(saveStatus);
  const chordName = React.useMemo(
    () => detectChordsFromNotes(selectedNotes),
    [selectedNotes],
  );
  const loopDuration = React.useMemo(
    () => formatLoopDuration(
      projectState.clock.ppqn,
      activeClip.timeline,
      previewLoop ?? activeClip.transportSettings.loop,
      gridResolutionTicks,
    ),
    [
      activeClip.timeline,
      activeClip.transportSettings.loop,
      gridResolutionTicks,
      previewLoop,
      projectState.clock.ppqn,
    ],
  );
  const selectionLabel = formatSelectionLabel(
    selectedNotes.length,
    selectedMarkerCount,
  );

  React.useEffect(() => {
    const updatePreview = (): void => {
      setPreviewLoop(loopDragPreview.get());
    };
    const unsubscribe = loopDragPreview.subscribe(updatePreview);

    updatePreview();
    return unsubscribe;
  }, [loopDragPreview]);

  return (
    <header className="app-header">
      <section
        className="left"
        aria-label="Project actions and transport"
      >
        <ProjectMenu
          projectTitle={projectState.title}
          midiInputRef={importMidiInputRef}
          onReturnHome={handleCloseProject}
          onExportProject={handleExportProject}
          onOpenMidiImport={handleOpenMidiImport}
          onExportMidi={handleExportMidi}
          onMidiFileChange={handleMidiFileChange}
          onProjectTitleCommit={handleProjectTitleCommit}
        />
        <TransportControls
          status={playbackStatus}
          loopEnabled={
            activeClip.transportSettings.loopEnabled
          }
          autoAdvanceEnabled={
            projectState.autoAdvanceEnabled
          }
          autoScrollEnabled={autoScrollEnabled}
          onReturnToStart={returnToStart}
          onTogglePlayback={togglePlayback}
          onToggleLoop={handleToggleLoop}
          onToggleAutoAdvance={handleToggleAutoAdvance}
          onToggleAutoScroll={handleToggleAutoScroll}
        />
        <div className="editor-context-panel" aria-label="Editor context">
          <span
            className={`project-save-status is-${saveStatus.state}`}
            role={saveStatus.state === "error" ? "alert" : "status"}
            aria-label={saveStatusLabel}
            title={saveStatus.state === "error"
              ? `${saveStatusLabel}: ${saveStatus.error.message}`
              : saveStatusLabel}
          />
          <div
            className={
              `editor-context-item is-loop${
                activeClip.transportSettings.loopEnabled
                  ? ""
                  : " is-inactive"
              }`
            }
            title="Loop duration"
          >
            <output>{loopDuration.musical}</output>
            <output className="editor-context-secondary">
              {loopDuration.absolute}
            </output>
          </div>
          <div
            className={
              `editor-context-item is-selection${
                selectedNotes.length === 0 && selectedMarkerCount === 0
                  ? " is-inactive"
                  : ""
              }`
            }
            title="Selection content"
          >
            <output>{selectionLabel}</output>
            <small>Selection</small>
          </div>
          <div
            className={
              `editor-context-item is-detection${
                chordName === null ? " is-inactive" : ""
              }`
            }
            title="Chords detected from selected notes"
          >
            <output>{chordName ?? "—"}</output>
            <small>Chords detection</small>
          </div>
        </div>
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

function formatSelectionLabel(
  noteCount: number,
  markerCount: number,
): string {
  const notes = `${String(noteCount)} note${noteCount === 1 ? "" : "s"}`;
  const markers =
    `${String(markerCount)} marker${markerCount === 1 ? "" : "s"}`;

  return `${notes} • ${markers}`;
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
