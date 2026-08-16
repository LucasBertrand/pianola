import React, {
  useCallback,
  useEffect,
  useRef,
  type ChangeEvent,
} from "react";
import {
  APPLICATION_COLORS,
} from "../../config/application-colors";
import {
  EDITOR_CONSTANTS,
} from "../../config/editor-config";
import {
  TONAL_SNAP_CONSTANTS,
} from "../../config/music-config";
import {
  createGridSettings,
  parseGridSubdivision,
  type GridSettings,
} from "../../editor/model/grid-settings";
import type {
  MutableRenderSignal,
} from "../../editor/model/render-signal";
import {
  getScaleDegreeColorIndex,
  getTonalPatternDefinition,
  isTonalPatternId,
  type PitchSnapSettings,
} from "../../music/pitch-snap";
import {
  getPreferredTonicLabel,
  getScaleDegreeLabel,
} from "../piano-roll/rendering/pitch-label";

export interface PitchSnapControlsProps {
  readonly settings: PitchSnapSettings;
  readonly gridSettings: MutableRenderSignal<GridSettings>;
  readonly onSettingsChange: (
    changes: Partial<PitchSnapSettings>,
  ) => void;
}

export function PitchSnapControls({
  settings: pitchSnapSettings,
  gridSettings,
  onSettingsChange,
}: PitchSnapControlsProps): React.JSX.Element {
  const gridSelectRef = useRef<HTMLSelectElement | null>(null);
  const subdivisionSelectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    const updateGridControl = (): void => {
      const settings = gridSettings.get();

      if (gridSelectRef.current !== null) {
        gridSelectRef.current.value = String(
          settings.baseResolutionTicks,
        );
      }

      if (subdivisionSelectRef.current !== null) {
        subdivisionSelectRef.current.value = settings.subdivision;
      }
    };
    const unsubscribeGrid = gridSettings.subscribe(updateGridControl);

    updateGridControl();

    return unsubscribeGrid;
  }, [gridSettings]);

  const handleGridChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
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
  const handleSubdivisionChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
      const subdivision = parseGridSubdivision(
        event.currentTarget.value,
      );

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
    <div
      className={
        `grid-control${pitchSnapSettings.enabled
          ? " is-snap-active"
          : ""
        }${pitchSnapSettings.visualGuideEnabled
          ? " is-guide-active"
          : ""
        }`
      }
      aria-label="Grid and tonal pitch snapping"
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
      <div
        className={
          `pitch-snap-control${pitchSnapSettings.enabled
            ? " is-snap-active"
            : ""
          }${pitchSnapSettings.visualGuideEnabled
            ? " is-guide-active"
            : ""
          }`
        }
      >
        <button
          className={`pitch-guide-toggle${
            pitchSnapSettings.visualGuideEnabled ? " is-active" : ""
          }`}
          type="button"
          title={
            pitchSnapSettings.visualGuideEnabled
              ? "Hide tonal guide"
              : "Show tonal guide"
          }
          aria-label={
            pitchSnapSettings.visualGuideEnabled
              ? "Hide tonal guide"
              : "Show tonal guide"
          }
          aria-pressed={
            pitchSnapSettings.visualGuideEnabled
          }
          onClick={() => {
            onSettingsChange({
              visualGuideEnabled:
                !pitchSnapSettings.visualGuideEnabled,
            });
          }}
        >
          <svg
            className="pitch-snap-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        </button>
        <button
          className={`pitch-snap-toggle${
            pitchSnapSettings.enabled ? " is-active" : ""
          }`}
          type="button"
          title={
            pitchSnapSettings.enabled
              ? "Disable tonal pitch snapping"
              : "Enable tonal pitch snapping"
          }
          aria-label={
            pitchSnapSettings.enabled
              ? "Disable tonal pitch snapping"
              : "Enable tonal pitch snapping"
          }
          aria-pressed={pitchSnapSettings.enabled}
          onClick={() => {
            onSettingsChange({
              enabled: !pitchSnapSettings.enabled,
            });
          }}
        >
          <svg
            className="pitch-snap-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M5 4v8a7 7 0 0 0 14 0V4" />
            <path d="M5 4h5M14 4h5" />
            <path d="M5 8h5M14 8h5" />
            <path d="M10 4v8a2 2 0 0 0 4 0V4" />
          </svg>
        </button>
        <select
          className="pitch-snap-tonic-select"
          value={pitchSnapSettings.tonicPitchClass}
          aria-label="Pitch snap tonic"
          onChange={(event) => {
            const tonicPitchClass =
              Number(event.currentTarget.value);

            if (
              Number.isInteger(tonicPitchClass)
              && tonicPitchClass >= 0
              && tonicPitchClass < 12
            ) {
              onSettingsChange({
                tonicPitchClass,
              });
            }
          }}
        >
          {TONAL_SNAP_CONSTANTS.tonicOptions.map(
            (option) => (
              <option
                key={option.value}
                value={option.value}
              >
                {getPreferredTonicLabel(
                  option.value,
                  pitchSnapSettings.patternId,
                )}
              </option>
            ),
          )}
        </select>
        <select
          className="pitch-snap-pattern-select"
          value={pitchSnapSettings.patternId}
          aria-label="Pitch snap mode"
          onChange={(event) => {
            const patternId = event.currentTarget.value;

            if (isTonalPatternId(patternId)) {
              onSettingsChange({
                patternId,
                scaleDegreeIndex: null,
              });
            }
          }}
        >
          {TONAL_SNAP_CONSTANTS.patternFamilies.map(
            (family) => (
              <optgroup
                key={family.id}
                label={family.label}
              >
                {TONAL_SNAP_CONSTANTS.patterns.map(
                  (pattern) => (
                    pattern.family === family.id
                      ? (
                        <option
                          key={pattern.id}
                          value={pattern.id}
                        >
                          {pattern.label}
                        </option>
                      )
                      : null
                  ),
                )}
              </optgroup>
            ),
          )}
        </select>
        <select
          className="pitch-snap-degree-select"
          value={pitchSnapSettings.scaleDegreeIndex ?? -1}
          aria-label="Pitch snap mode degree"
          style={{
            "--degree-color":
              pitchSnapSettings.scaleDegreeIndex === null
                ? APPLICATION_COLORS.accent.tonal
                : getScaleDegreeAccentColor(
                  pitchSnapSettings,
                  pitchSnapSettings.scaleDegreeIndex,
                ),
          } as React.CSSProperties}
          onChange={(event) => {
            const scaleDegreeIndex = Number(
              event.currentTarget.value,
            );
            const pattern = getTonalPatternDefinition(
              pitchSnapSettings.patternId,
            );

            onSettingsChange({
              scaleDegreeIndex:
                scaleDegreeIndex >= 0
                  && scaleDegreeIndex < pattern.intervals.length
                  ? scaleDegreeIndex
                  : null,
            });
          }}
        >
          <option value={-1}>Full mode</option>
          {getTonalPatternDefinition(
            pitchSnapSettings.patternId,
          ).intervals.map((_, degreeIndex) => (
            <option
              key={degreeIndex}
              value={degreeIndex}
              style={{
                color: getScaleDegreeAccentColor(
                  pitchSnapSettings,
                  degreeIndex,
                ),
              }}
            >
              {getScaleDegreeLabel(
                pitchSnapSettings,
                degreeIndex,
              )}
            </option>
          ))}
        </select>
      </div>
    </div>

  );
}

function getScaleDegreeAccentColor(
  settings: PitchSnapSettings,
  degreeIndex: number,
): string {
  const colorIndex = getScaleDegreeColorIndex(settings, degreeIndex);

  return colorIndex === null
    ? APPLICATION_COLORS.accent.tonal
    : APPLICATION_COLORS.pianoRoll.degreeAccents[colorIndex]
    ?? APPLICATION_COLORS.accent.tonal;
}
