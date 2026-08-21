import React, {
  type RefObject,
} from "react";
import {
  EDITOR_CONSTANTS,
  VIEWPORT_CONSTANTS,
} from "../../config/editor-config";
import { detectChordsFromNotes } from "../../music/chord-recognition";
import type { Note } from "../../domain/notes/note";
import {
  MAXIMUM_HORIZONTAL_ZOOM,
  MAXIMUM_VERTICAL_ZOOM,
} from "../../editor/geometry/converter";
import type {
  PitchSnapSettings,
} from "../../music/pitch-snap";
import {
  createGridSettings,
  parseGridSubdivision,
  type GridSettings,
} from "../../editor/model/grid-settings";
import type {
  MutableRenderSignal,
} from "../../editor/model/render-signal";

export interface PianoRollViewportControlsProps {
  readonly selectedNotes: readonly Note[];
  readonly timelinePositionRef: RefObject<HTMLOutputElement | null>;
  readonly timelineTimeRef: RefObject<HTMLOutputElement | null>;
  readonly horizontalScrollRef: RefObject<HTMLInputElement | null>;
  readonly horizontalZoomRef: RefObject<HTMLInputElement | null>;
  readonly verticalScrollRef: RefObject<HTMLInputElement | null>;
  readonly verticalZoomRef: RefObject<HTMLInputElement | null>;
  readonly gridSettings: MutableRenderSignal<GridSettings>;
  readonly pitchSnapSettings: PitchSnapSettings;
  readonly onPitchSnapSettingsChange: (
    changes: Partial<PitchSnapSettings>,
  ) => void;
}

export function PianoRollViewportControls({
  selectedNotes,
  timelinePositionRef,
  timelineTimeRef,
  horizontalScrollRef,
  horizontalZoomRef,
  verticalScrollRef,
  verticalZoomRef,
  gridSettings,
  pitchSnapSettings,
  onPitchSnapSettingsChange,
}: PianoRollViewportControlsProps): React.JSX.Element {
  const chordName = React.useMemo(
    () => detectChordsFromNotes(selectedNotes),
    [selectedNotes],
  );

  return (
    <div className="view-controls">
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
                (
                  VIEWPORT_CONSTANTS.maximumMidiPitch
                  - VIEWPORT_CONSTANTS.minimumMidiPitch
                  + 1
                )
                  * VIEWPORT_CONSTANTS.initialPitchHeightCssPixels
                  * VIEWPORT_CONSTANTS.initialVerticalZoom
                  - VIEWPORT_CONSTANTS.initialHeightCssPixels,
              )}
              step="any"
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
              min={VIEWPORT_CONSTANTS.minimumStoredZoom}
              max={MAXIMUM_VERTICAL_ZOOM}
              step={EDITOR_CONSTANTS.zoomStep}
              defaultValue={VIEWPORT_CONSTANTS.initialVerticalZoom}
              aria-label="Vertical pitch zoom"
            />
          </label>
        </div>
      </div>
      <div className="view-controls-right">
        {chordName && (
          <div className="timeline-position chord-recognition">
            <output>{chordName}</output>
          </div>
        )}
        <GridAndSnapControls
          settings={pitchSnapSettings}
          gridSettings={gridSettings}
          onSettingsChange={onPitchSnapSettingsChange}
        />
      </div>
    </div>
  );
}

function GridAndSnapControls({
  settings: pitchSnapSettings,
  gridSettings,
  onSettingsChange,
}: {
  readonly settings: PitchSnapSettings;
  readonly gridSettings: MutableRenderSignal<GridSettings>;
  readonly onSettingsChange: (changes: Partial<PitchSnapSettings>) => void;
}) {
  const gridSelectRef = React.useRef<HTMLSelectElement | null>(null);
  const subdivisionSelectRef = React.useRef<HTMLSelectElement | null>(null);

  React.useEffect(() => {
    const updateGridControl = (): void => {
      const settings = gridSettings.get();

      if (gridSelectRef.current !== null) {
        gridSelectRef.current.value = String(settings.baseResolutionTicks);
      }

      if (subdivisionSelectRef.current !== null) {
        subdivisionSelectRef.current.value = settings.subdivision;
      }
    };
    const unsubscribeGrid = gridSettings.subscribe(updateGridControl);

    updateGridControl();

    return unsubscribeGrid;
  }, [gridSettings]);

  const handleGridChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>): void => {
      const baseResolutionTicks = Number(event.currentTarget.value);

      if (
        Number.isSafeInteger(baseResolutionTicks)
        && baseResolutionTicks > 0
      ) {
        gridSettings.set(
          createGridSettings(
            baseResolutionTicks,
            gridSettings.get().subdivision,
          ),
        );
      }
    },
    [gridSettings],
  );
  const handleSubdivisionChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>): void => {
      const subdivision = parseGridSubdivision(event.currentTarget.value);

      if (subdivision === null) {
        return;
      }

      gridSettings.set(
        createGridSettings(
          gridSettings.get().baseResolutionTicks,
          subdivision,
        ),
      );
    },
    [gridSettings],
  );

  return (
    <>
      <div
        className="grid-control"
        aria-label="Grid settings"
      >
        <div className="grid-control-header">
          <select
            ref={gridSelectRef}
            className="grid-control-select"
            defaultValue="240"
            onChange={handleGridChange}
            aria-label="Grid resolution"
          >
            {EDITOR_CONSTANTS.gridResolutionOptions.map((option) => (
              <option key={option.ticks} value={option.ticks}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            ref={subdivisionSelectRef}
            className="grid-control-select"
            defaultValue="straight"
            onChange={handleSubdivisionChange}
            aria-label="Grid subdivision"
          >
            {EDITOR_CONSTANTS.gridSubdivisionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={`pitch-snap-control${pitchSnapSettings.enabled ? " is-snap-active" : ""}${pitchSnapSettings.visualGuideEnabled ? " is-guide-active" : ""}`}>
        <button
          className={`pitch-snap-toggle${pitchSnapSettings.visualGuideEnabled ? " is-active" : ""}`}
          type="button"
          title={pitchSnapSettings.visualGuideEnabled ? "Hide tonal guide" : "Show tonal guide"}
          aria-label={pitchSnapSettings.visualGuideEnabled ? "Hide tonal guide" : "Show tonal guide"}
          aria-pressed={pitchSnapSettings.visualGuideEnabled}
          onClick={() => {
            onSettingsChange({ visualGuideEnabled: !pitchSnapSettings.visualGuideEnabled });
          }}
        >
          <svg
            className="pitch-snap-icon"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path d="M10 2a8 8 0 1 0 0 16h1.2a1.8 1.8 0 0 0 0-3.6h-.6a1.3 1.3 0 0 1 0-2.6H13A5 5 0 0 0 18 7c0-2.8-3.6-5-8-5Z" />
            <circle cx="6" cy="7" r="1" />
            <circle cx="9.5" cy="5" r="1" />
            <circle cx="13" cy="6.5" r="1" />
          </svg>
        </button>
        <button
          className={`pitch-snap-toggle${pitchSnapSettings.enabled ? " is-active" : ""}`}
          type="button"
          title={pitchSnapSettings.enabled ? "Disable tonal pitch snapping" : "Enable tonal pitch snapping"}
          aria-label={pitchSnapSettings.enabled ? "Disable tonal pitch snapping" : "Enable tonal pitch snapping"}
          aria-pressed={pitchSnapSettings.enabled}
          onClick={() => {
            onSettingsChange({ enabled: !pitchSnapSettings.enabled });
          }}
        >
          <svg className="pitch-snap-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 4v8a7 7 0 0 0 14 0V4" />
            <path d="M5 4h5M14 4h5" />
            <path d="M5 8h5M14 8h5" />
            <path d="M10 4v8a2 2 0 0 0 4 0V4" />
          </svg>
        </button>
      </div>
    </>
  );
}
