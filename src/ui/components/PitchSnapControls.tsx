import React from "react";
import {
  APPLICATION_COLORS,
} from "../../config/application-colors";
import {
  TONAL_SNAP_CONSTANTS,
} from "../../config/program-constants";
import {
  getScaleDegreeColorIndex,
  getTonalPatternDefinition,
  isTonalPatternId,
  type PitchSnapSettings,
} from "../../music/pitch-snap";
import {
  getPreferredTonicLabel,
  getScaleDegreeLabel,
} from "../rendering/pitch-label";

export interface PitchSnapControlsProps {
  readonly settings: PitchSnapSettings;
  readonly onSettingsChange: (
    changes: Partial<PitchSnapSettings>,
  ) => void;
}

export function PitchSnapControls({
  settings: pitchSnapSettings,
  onSettingsChange,
}: PitchSnapControlsProps): React.JSX.Element {
  return (
  <div
    className={
      `pitch-snap-control${
        pitchSnapSettings.enabled
          ? " is-snap-active"
          : ""
      }${
        pitchSnapSettings.visualGuideEnabled
          ? " is-guide-active"
          : ""
      }`
    }
    aria-label="Tonal pitch snapping"
  >
    <button
      className="pitch-guide-toggle"
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
      disabled={pitchSnapSettings.enabled}
      onClick={() => {
        if (pitchSnapSettings.enabled) {
          return;
        }

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
      className="pitch-snap-toggle"
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
        const enabled = !pitchSnapSettings.enabled;

        onSettingsChange(
          enabled
            ? {
                enabled: true,
                visualGuideEnabled: true,
              }
            : { enabled: false },
        );
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

