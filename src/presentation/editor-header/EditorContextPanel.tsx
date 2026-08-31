import React from "react";
import type {
  ProjectSaveStatus,
} from "../../application/persistence/project-autosave";
import {
  resolvePitchSnapSettings,
} from "../../application/piano-roll/timeline/pitch-snap-resolution";
import {
  detectChordsFromNotes,
} from "../../domain/music-theory/chord-recognition";
import type {
  PitchSnapSettings,
} from "../../domain/music-theory/pitch-snap";
import {
  spellPitchClass,
} from "../../domain/music-theory/tonal-spelling";
import type {
  Note,
} from "../../domain/notes/note";
import {
  getActiveClip,
  type EditorSessionState,
} from "../../domain/project/project-document";
import type {
  ReadonlyRenderSignal,
} from "../../editor-core/model/render-signal";
import {
  formatLoopDuration,
  formatSaveStatus,
  formatSelectionLabel,
} from "./editor-context-format";
import {
  resolveEffectiveLoop,
  type LoopPreview,
} from "../../application/editor-session/loop-preview-session";

export interface EditorContextPanelProps {
  readonly projectState: EditorSessionState;
  readonly loopPreview: ReadonlyRenderSignal<LoopPreview | null>;
  readonly selectedNotes: readonly Note[];
  readonly selectedMarkerCount: number;
  readonly gridResolutionTicks: number;
  readonly pitchSnapSettings: PitchSnapSettings;
  readonly saveStatus: ProjectSaveStatus;
}

/** Owns the derived and preview state rendered by the header context rail. */
export function EditorContextPanel({
  projectState,
  loopPreview,
  selectedNotes,
  selectedMarkerCount,
  gridResolutionTicks,
  pitchSnapSettings,
  saveStatus,
}: EditorContextPanelProps): React.JSX.Element {
  const [previewLoop, setPreviewLoop] = React.useState(
    () => loopPreview.get(),
  );
  const activeClip = getActiveClip(projectState);
  const saveStatusLabel = formatSaveStatus(saveStatus);
  const chordName = React.useMemo(
    () => detectChordsFromNotes(
      selectedNotes,
      (note) => spellPitchClass(
        note.pitch,
        resolvePitchSnapSettings(
          activeClip.timeline.timeMap,
          pitchSnapSettings,
          note.startTick,
        ),
      ),
    ),
    [activeClip.timeline.timeMap, pitchSnapSettings, selectedNotes],
  );
  const loopDuration = React.useMemo(
    () => formatLoopDuration(
      projectState.clock.ppqn,
      activeClip.timeline,
      resolveEffectiveLoop(
        activeClip.transportSettings.loop,
        previewLoop,
        activeClip.id,
        projectState.revision,
      ),
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
      setPreviewLoop(loopPreview.get());
    };
    const unsubscribe = loopPreview.subscribe(updatePreview);

    updatePreview();
    return unsubscribe;
  }, [loopPreview]);

  return (
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
          `editor-context-item is-loop${activeClip.transportSettings.loopEnabled
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
          `editor-context-item is-selection${selectedNotes.length === 0 && selectedMarkerCount === 0
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
          `editor-context-item is-detection${chordName === null ? " is-inactive" : ""
          }`
        }
        title="Chords and intervals detected from selected notes"
      >
        <output>{chordName ?? "—"}</output>
        <small>Harmony</small>
      </div>
    </div>
  );
}
