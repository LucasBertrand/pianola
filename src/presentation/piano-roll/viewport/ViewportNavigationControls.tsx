import React, {
  type RefObject,
} from "react";
import {
  MAXIMUM_HORIZONTAL_ZOOM,
  MAXIMUM_VERTICAL_ZOOM,
} from "../../../editor-core/geometry/converter";
import {
  EDITOR_CONSTANTS,
} from "../../../editor-core/model/editor-constants";
import {
  VIEWPORT_CONSTANTS,
} from "../../../editor-core/viewport/viewport-constants";

export interface ViewportNavigationControlsProps {
  readonly timelinePositionRef: RefObject<HTMLOutputElement | null>;
  readonly timelineTimeRef: RefObject<HTMLOutputElement | null>;
  readonly horizontalScrollRef: RefObject<HTMLInputElement | null>;
  readonly horizontalZoomRef: RefObject<HTMLInputElement | null>;
  readonly verticalScrollRef: RefObject<HTMLInputElement | null>;
  readonly verticalZoomRef: RefObject<HTMLInputElement | null>;
}

export function ViewportNavigationControls({
  timelinePositionRef,
  timelineTimeRef,
  horizontalScrollRef,
  horizontalZoomRef,
  verticalScrollRef,
  verticalZoomRef,
}: ViewportNavigationControlsProps): React.JSX.Element {
  return (
    <div className="view-controls-left">
      <div className="timeline-position">
        <output ref={timelinePositionRef}>1.1.1</output>
        <output
          className="timeline-time-position"
          ref={timelineTimeRef}
        >
          00:00:00
        </output>
      </div>
      <div className="view-sliders">
        <label className="view-position-control">
          <span aria-hidden="true">X</span>
          <input
            ref={horizontalScrollRef}
            type="range"
            min="0"
            step="any"
            defaultValue="0"
            aria-label="Horizontal timeline position"
          />
        </label>
        <label className="view-zoom-control">
          <span aria-hidden="true">ZX</span>
          <input
            ref={horizontalZoomRef}
            type="range"
            min={VIEWPORT_CONSTANTS.minimumStoredZoom}
            max={MAXIMUM_HORIZONTAL_ZOOM}
            step={EDITOR_CONSTANTS.zoomStep}
            defaultValue={VIEWPORT_CONSTANTS.initialHorizontalZoom}
            aria-label="Horizontal zoom"
          />
        </label>
        <label className="view-position-control">
          <span aria-hidden="true">Y</span>
          <input
            ref={verticalScrollRef}
            type="range"
            min="0"
            max={Math.max(
              0,
              VIEWPORT_CONSTANTS.displayedPitchCount
              * VIEWPORT_CONSTANTS.initialPitchHeightCssPixels
              * VIEWPORT_CONSTANTS.initialVerticalZoom
              - VIEWPORT_CONSTANTS.initialHeightCssPixels,
            )}
            step="any"
            defaultValue={String(
              (
                VIEWPORT_CONSTANTS.highestDisplayedMidiPitch
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
            min={VIEWPORT_CONSTANTS.minimumStoredZoom}
            max={MAXIMUM_VERTICAL_ZOOM}
            step={EDITOR_CONSTANTS.zoomStep}
            defaultValue={VIEWPORT_CONSTANTS.initialVerticalZoom}
            aria-label="Vertical pitch zoom"
          />
        </label>
      </div>
    </div>
  );
}
