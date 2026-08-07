import React, {
  type RefObject,
} from "react";
import {
  EDITOR_CONSTANTS,
  VIEWPORT_CONSTANTS,
} from "../../config/program-constants";
import {
  MAXIMUM_HORIZONTAL_ZOOM,
  MAXIMUM_VERTICAL_ZOOM,
  MINIMUM_HORIZONTAL_ZOOM,
  MINIMUM_VERTICAL_ZOOM,
} from "../../geometry/converter";
import type {
  PitchSnapSettings,
} from "../../music/pitch-snap";
import {
  PitchSnapControls,
} from "./PitchSnapControls";

export interface ViewControlsProps {
  readonly timelinePositionRef: RefObject<HTMLOutputElement | null>;
  readonly timelineTimeRef: RefObject<HTMLOutputElement | null>;
  readonly horizontalScrollRef: RefObject<HTMLInputElement | null>;
  readonly horizontalZoomRef: RefObject<HTMLInputElement | null>;
  readonly horizontalZoomLabelRef: RefObject<HTMLOutputElement | null>;
  readonly verticalScrollRef: RefObject<HTMLInputElement | null>;
  readonly verticalZoomRef: RefObject<HTMLInputElement | null>;
  readonly verticalZoomLabelRef: RefObject<HTMLOutputElement | null>;
  readonly pitchSnapSettings: PitchSnapSettings;
  readonly onPitchSnapSettingsChange: (
    changes: Partial<PitchSnapSettings>,
  ) => void;
}

export function ViewControls({
  timelinePositionRef,
  timelineTimeRef,
  horizontalScrollRef,
  horizontalZoomRef,
  horizontalZoomLabelRef,
  verticalScrollRef,
  verticalZoomRef,
  verticalZoomLabelRef,
  pitchSnapSettings,
  onPitchSnapSettingsChange,
}: ViewControlsProps): React.JSX.Element {
  return (
    <div className="view-controls">
      <div className="timeline-position">
        <output ref={timelinePositionRef}>1.1.1</output>
        <output
          className="timeline-time-position"
          ref={timelineTimeRef}
        >
          00:00:00
        </output>
      </div>
      <label className="view-position-control">
        <span aria-hidden="true">X</span>
        <input
          ref={horizontalScrollRef}
          type="range"
          min="0"
          step={EDITOR_CONSTANTS.horizontalScrollStep}
          defaultValue="0"
          aria-label="Horizontal timeline position"
        />
      </label>
      <label className="view-zoom-control">
        <span aria-hidden="true">ZX</span>
        <input
          ref={horizontalZoomRef}
          type="range"
          min={MINIMUM_HORIZONTAL_ZOOM}
          max={MAXIMUM_HORIZONTAL_ZOOM}
          step={EDITOR_CONSTANTS.zoomStep}
          defaultValue={VIEWPORT_CONSTANTS.initialHorizontalZoom}
          aria-label="Horizontal zoom"
        />
        <output ref={horizontalZoomLabelRef}>
          {Math.round(
            VIEWPORT_CONSTANTS.initialHorizontalZoom * 100,
          )}%
        </output>
      </label>
      <div className="pitch-view-controls">
        <label className="view-position-control">
          <span aria-hidden="true">Y</span>
          <input
            ref={verticalScrollRef}
            type="range"
            min="0"
            max={Math.max(
              0,
              (
                VIEWPORT_CONSTANTS.maximumMidiPitch
                - VIEWPORT_CONSTANTS.minimumMidiPitch
                + 1
              )
                * VIEWPORT_CONSTANTS.initialPitchHeightCssPixels
                * VIEWPORT_CONSTANTS.initialVerticalZoom
                - VIEWPORT_CONSTANTS.initialHeightCssPixels,
            )}
            step={EDITOR_CONSTANTS.verticalScrollStep}
            defaultValue={String(
              (
                VIEWPORT_CONSTANTS.maximumMidiPitch
                - VIEWPORT_CONSTANTS.initialMaximumVisiblePitch
              ) * VIEWPORT_CONSTANTS.initialPitchHeightCssPixels,
            )}
            aria-label="Vertical pitch position"
          />
        </label>
        <label className="view-zoom-control">
          <span aria-hidden="true">ZY</span>
          <input
            ref={verticalZoomRef}
            type="range"
            min={MINIMUM_VERTICAL_ZOOM}
            max={MAXIMUM_VERTICAL_ZOOM}
            step={EDITOR_CONSTANTS.zoomStep}
            defaultValue={VIEWPORT_CONSTANTS.initialVerticalZoom}
            aria-label="Vertical pitch zoom"
          />
          <output ref={verticalZoomLabelRef}>
            {Math.round(
              VIEWPORT_CONSTANTS.initialVerticalZoom * 100,
            )}%
          </output>
        </label>
      </div>
      <PitchSnapControls
        settings={pitchSnapSettings}
        onSettingsChange={onPitchSnapSettingsChange}
      />
    </div>
  );
}
