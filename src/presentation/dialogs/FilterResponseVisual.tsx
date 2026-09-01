import React from "react";
import {
  SYNTH_CONSTANTS,
} from "../../domain/instruments/synth/synth-constants";

const VIEWBOX_LEFT = 8;
const VIEWBOX_RIGHT = 124;
const VIEWBOX_TOP = 10;
const VIEWBOX_BOTTOM = 66;
const MINIMUM_RESPONSE_DECIBELS = -60;
const MAXIMUM_RESPONSE_DECIBELS = 18;
const RESPONSE_SAMPLE_COUNT = 97;
const SECOND_STAGE_DAMPING = Math.SQRT2;

export interface FilterResponsePreview {
  readonly points: ReadonlyArray<readonly [number, number]>;
  readonly cutoffX: number;
  readonly cutoffY: number;
  readonly zeroDecibelY: number;
}

interface FilterResponseVisualProps {
  readonly cutoffHz: number;
  readonly resonance: number;
}

/** Shows the approximate magnitude response of the synth's four-pole filter. */
export function FilterResponseVisual({
  cutoffHz,
  resonance,
}: FilterResponseVisualProps): React.JSX.Element {
  const preview = createFilterResponsePreview(cutoffHz, resonance);
  const title = `Filter response preview: ${Math.round(cutoffHz)} Hz cutoff, ${
    resonance.toFixed(1)
  } resonance`;

  return (
    <div className="instrument-editor-visual">
      <span>Response</span>
      <svg viewBox="0 0 132 80" role="img" aria-label={title}>
        <title>{title}</title>
        <path
          className="instrument-editor-visual-grid"
          d={`M${VIEWBOX_LEFT} ${preview.zeroDecibelY}H${VIEWBOX_RIGHT}`}
        />
        <path
          className="instrument-editor-visual-guide"
          d={`M${preview.cutoffX} ${VIEWBOX_TOP}V${VIEWBOX_BOTTOM}`}
        />
        <polyline
          className="instrument-editor-visual-line"
          points={preview.points
            .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
            .join(" ")}
        />
        <circle
          className="instrument-editor-visual-node"
          cx={preview.cutoffX}
          cy={preview.cutoffY}
          r="2.5"
        />
      </svg>
    </div>
  );
}

export function createFilterResponsePreview(
  cutoffHz: number,
  resonance: number,
): FilterResponsePreview {
  const minimumFrequency = SYNTH_CONSTANTS.minimumFilterCutoffHz;
  const maximumFrequency = SYNTH_CONSTANTS.maximumFilterCutoffHz;
  const clampedCutoff = clamp(cutoffHz, minimumFrequency, maximumFrequency);
  const clampedResonance = clamp(
    resonance,
    SYNTH_CONSTANTS.minimumFilterResonance,
    SYNTH_CONSTANTS.maximumFilterResonance,
  );
  const frequencyRangeOctaves = Math.log2(maximumFrequency / minimumFrequency);
  const cutoffProgress = Math.log2(clampedCutoff / minimumFrequency)
    / frequencyRangeOctaves;
  const cutoffX = frequencyProgressToX(cutoffProgress);
  const cutoffY = responseDecibelsToY(
    calculateResponseDecibels(clampedCutoff, clampedCutoff, clampedResonance),
  );

  return {
    points: Array.from({ length: RESPONSE_SAMPLE_COUNT }, (_, index) => {
      const progress = index / (RESPONSE_SAMPLE_COUNT - 1);
      const frequency = minimumFrequency * 2 ** (
        progress * frequencyRangeOctaves
      );

      return [
        frequencyProgressToX(progress),
        responseDecibelsToY(
          calculateResponseDecibels(
            frequency,
            clampedCutoff,
            clampedResonance,
          ),
        ),
      ] as const;
    }),
    cutoffX,
    cutoffY,
    zeroDecibelY: responseDecibelsToY(0),
  };
}

function calculateResponseDecibels(
  frequencyHz: number,
  cutoffHz: number,
  resonance: number,
): number {
  const frequencyRatio = frequencyHz / cutoffHz;
  const squaredRatio = frequencyRatio * frequencyRatio;
  const sharedRealTerm = 1 - squaredRatio;
  const firstStageDamping = 1 / Math.max(0.5, resonance);
  const firstStageMagnitude = 1 / Math.sqrt(
    sharedRealTerm * sharedRealTerm
    + firstStageDamping * firstStageDamping * squaredRatio,
  );
  const secondStageMagnitude = 1 / Math.sqrt(
    sharedRealTerm * sharedRealTerm
    + SECOND_STAGE_DAMPING * SECOND_STAGE_DAMPING * squaredRatio,
  );

  return 20 * Math.log10(firstStageMagnitude * secondStageMagnitude);
}

function frequencyProgressToX(progress: number): number {
  return VIEWBOX_LEFT + progress * (VIEWBOX_RIGHT - VIEWBOX_LEFT);
}

function responseDecibelsToY(decibels: number): number {
  const clampedDecibels = clamp(
    decibels,
    MINIMUM_RESPONSE_DECIBELS,
    MAXIMUM_RESPONSE_DECIBELS,
  );
  const progress = (
    MAXIMUM_RESPONSE_DECIBELS - clampedDecibels
  ) / (MAXIMUM_RESPONSE_DECIBELS - MINIMUM_RESPONSE_DECIBELS);

  return VIEWBOX_TOP + progress * (VIEWBOX_BOTTOM - VIEWBOX_TOP);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
