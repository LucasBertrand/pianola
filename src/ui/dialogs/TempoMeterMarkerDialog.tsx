import React from "react";
import {
  PROJECT_CONSTANTS,
} from "../../config/domain-limits";
import type {
  TimeSignature,
} from "../../domain/transport/time-map";
import { TONAL_SNAP_CONSTANTS } from "../../config/music-config";
import type { TonalPatternId } from "../../music/pitch-snap";
import { getPreferredTonicLabel } from "../piano-roll/rendering/pitch-label";

const DENOMINATOR_OPTIONS = [1, 2, 4, 8, 16, 32] as const;

export interface TempoMeterMarkerDialogProps {
  readonly mode: "create" | "edit";
  readonly measureIndex: number | null;
  readonly bpm: number;
  readonly timeSignature: TimeSignature | null;
  readonly tonicPitchClass: number;
  readonly patternId: TonalPatternId;
  readonly scaleDegreeIndex: number | null;
  readonly canDelete: boolean;
  readonly onBpmChange: (bpm: number) => void;
  readonly onTimeSignatureChange: (timeSignature: TimeSignature) => void;
  readonly onTonicPitchClassChange: (tonicPitchClass: number) => void;
  readonly onPatternIdChange: (patternId: TonalPatternId) => void;
  readonly onScaleDegreeIndexChange: (scaleDegreeIndex: number | null) => void;
  readonly onDelete: () => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** Draft-only tempo/meter marker dialog; the document mutates on confirm. */
export function TempoMeterMarkerDialog({
  mode,
  measureIndex,
  bpm,
  timeSignature,
  tonicPitchClass,
  patternId,
  scaleDegreeIndex,
  canDelete,
  onBpmChange,
  onTimeSignatureChange,
  onTonicPitchClassChange,
  onPatternIdChange,
  onScaleDegreeIndexChange,
  onDelete,
  onConfirm,
  onCancel,
}: TempoMeterMarkerDialogProps): React.JSX.Element {
  const selectedPattern = TONAL_SNAP_CONSTANTS.patterns.find(
    (pattern) => pattern.id === patternId,
  );
  return (
    <div className="application-dialog-backdrop">
      <form
        className="application-dialog tempo-meter-marker-dialog"
        data-tone="default"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tempo-meter-marker-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div className="application-dialog-heading">
          <span className="application-dialog-mark" aria-hidden="true">
            {mode === "create" ? "+" : "~"}
          </span>
          <h2 id="tempo-meter-marker-dialog-title">
            {mode === "create"
              ? measureIndex !== null
                ? `Add marker at measure ${String(measureIndex + 1)}`
                : "Add tempo marker"
              : measureIndex !== null
                ? `Edit marker at measure ${String(measureIndex + 1)}`
                : "Edit tempo marker"}
          </h2>
        </div>

        <label className="instrument-preset-dialog-control">
          <span>Tempo (BPM)</span>
          <input
            type="number"
            value={bpm}
            min={PROJECT_CONSTANTS.minimumTempoBpm}
            max={PROJECT_CONSTANTS.maximumTempoBpm}
            step={PROJECT_CONSTANTS.tempoStepBpm}
            inputMode="decimal"
            autoFocus
            aria-label="Marker tempo in beats per minute"
            onChange={(event) => {
              onBpmChange(event.currentTarget.valueAsNumber);
            }}
          />
        </label>
        
        {timeSignature !== null && (
          <div className="instrument-preset-dialog-control">
            <span>Meter</span>
            <div className="tempo-meter-marker-meter">
              <select
                value={timeSignature.numerator}
                aria-label="Meter numerator"
                onChange={(event) => {
                  const numerator = Number(event.currentTarget.value);

                  if (Number.isSafeInteger(numerator)) {
                    onTimeSignatureChange({
                      ...timeSignature,
                      numerator,
                    });
                  }
                }}
              >
                {Array.from(
                  { length: PROJECT_CONSTANTS.maximumTimeSignatureNumerator },
                  (_, i) => i + 1,
                ).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <span aria-hidden="true">/</span>
              <select
                value={timeSignature.denominator}
                aria-label="Meter denominator"
                onChange={(event) => {
                  const denominator = Number(event.currentTarget.value);

                  if (
                    (DENOMINATOR_OPTIONS as readonly number[]).includes(
                      denominator,
                    )
                  ) {
                    onTimeSignatureChange({
                      ...timeSignature,
                      denominator:
                        denominator as TimeSignature["denominator"],
                    });
                  }
                }}
              >
                {DENOMINATOR_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <label className="instrument-preset-dialog-control">
          <span>Tonic</span>
          <select
            value={tonicPitchClass}
            aria-label="Tonic pitch class"
            onChange={(event) => {
              onTonicPitchClassChange(Number(event.currentTarget.value));
            }}
          >
            {TONAL_SNAP_CONSTANTS.tonicOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {getPreferredTonicLabel(opt.value, patternId)}
              </option>
            ))}
          </select>
        </label>

        <label className="instrument-preset-dialog-control">
          <span>Scale</span>
          <select
            value={patternId}
            aria-label="Tonal scale pattern"
            onChange={(event) => {
              onPatternIdChange(event.currentTarget.value as TonalPatternId);
            }}
          >
            {TONAL_SNAP_CONSTANTS.patterns.map((pattern) => (
              <option key={pattern.id} value={pattern.id}>
                {pattern.label}
              </option>
            ))}
          </select>
        </label>

        {selectedPattern !== undefined && selectedPattern.id !== "chromatic" ? (
          <label className="instrument-preset-dialog-control">
            <span>Degree</span>
            <select
              value={scaleDegreeIndex === null ? "none" : scaleDegreeIndex}
              aria-label="Scale degree highlight"
              onChange={(event) => {
                const value = event.currentTarget.value;
                onScaleDegreeIndexChange(value === "none" ? null : Number(value));
              }}
            >
              <option value="none">None</option>
              {selectedPattern.intervals.map((_, index) => (
                <option key={index} value={index}>
                  Degree {index + 1}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div
          className={`application-dialog-actions${
            canDelete ? " has-alternate" : ""
          }`}
        >
          {canDelete
            ? (
                <button
                  className="application-dialog-button is-danger"
                  type="button"
                  onClick={onDelete}
                >
                  Delete
                </button>
              )
            : null}
          <button
            className="application-dialog-button"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="application-dialog-button is-primary"
            type="submit"
          >
            {mode === "create" ? "Add marker" : "Apply"}
          </button>
        </div>
      </form>
    </div>
  );
}
