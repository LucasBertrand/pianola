import React, {
  type RefObject,
} from "react";
import type {
  PitchSnapSettings,
} from "../../../domain/music-theory/pitch-snap";
import type {
  GridSettings,
} from "../../../editor-core/model/grid-settings";
import type {
  MutableRenderSignal,
} from "../../../editor-core/model/render-signal";
import type {
  NoteColorMode,
} from "../../../editor-core/model/note-color-mode";
import {
  AutoFitViewportButton,
} from "./AutoFitViewportButton";
import {
  GridControls,
} from "./GridControls";
import {
  PitchSnapControls,
} from "./PitchSnapControls";
import {
  ViewportNavigationControls,
} from "./ViewportNavigationControls";

export interface PianoRollViewportControlsProps {
  readonly timelinePositionRef: RefObject<HTMLOutputElement | null>;
  readonly timelineTimeRef: RefObject<HTMLOutputElement | null>;
  readonly horizontalScrollRef: RefObject<HTMLInputElement | null>;
  readonly horizontalZoomRef: RefObject<HTMLInputElement | null>;
  readonly verticalScrollRef: RefObject<HTMLInputElement | null>;
  readonly verticalZoomRef: RefObject<HTMLInputElement | null>;
  readonly gridSettings: MutableRenderSignal<GridSettings>;
  readonly pitchSnapSettings: PitchSnapSettings;
  readonly noteColorMode: NoteColorMode;
  readonly onNoteColorModeToggle: () => void;
  readonly onPitchSnapSettingsChange: (
    changes: Partial<PitchSnapSettings>,
  ) => void;
  readonly onAutoFit: () => void;
}

/** Composes navigation, grid and tonal controls for the piano-roll viewport. */
export function PianoRollViewportControls({
  timelinePositionRef,
  timelineTimeRef,
  horizontalScrollRef,
  horizontalZoomRef,
  verticalScrollRef,
  verticalZoomRef,
  gridSettings,
  pitchSnapSettings,
  noteColorMode,
  onNoteColorModeToggle,
  onPitchSnapSettingsChange,
  onAutoFit,
}: PianoRollViewportControlsProps): React.JSX.Element {
  return (
    <div className="view-controls">
      <ViewportNavigationControls
        timelinePositionRef={timelinePositionRef}
        timelineTimeRef={timelineTimeRef}
        horizontalScrollRef={horizontalScrollRef}
        horizontalZoomRef={horizontalZoomRef}
        verticalScrollRef={verticalScrollRef}
        verticalZoomRef={verticalZoomRef}
      />
      <div className="view-controls-right">
        <GridControls gridSettings={gridSettings} />
        <PitchSnapControls
          settings={pitchSnapSettings}
          noteColorMode={noteColorMode}
          onNoteColorModeToggle={onNoteColorModeToggle}
          onSettingsChange={onPitchSnapSettingsChange}
        />
        <AutoFitViewportButton onAutoFit={onAutoFit} />
      </div>
    </div>
  );
}
