import React from "react";
import {
  PROJECT_CONSTANTS,
} from "../../config/domain-limits";
import type {
  TimeSignature,
} from "../../domain/transport/time-map";

const DENOMINATOR_OPTIONS = [1, 2, 4, 8, 16, 32] as const;

export interface TempoMeterMarkerDialogProps {
  readonly mode: "create" | "edit";
  readonly measureIndex: number | null;
  readonly bpm: number;
  readonly timeSignature: TimeSignature | null;
  readonly canDelete: boolean;
  readonly onBpmChange: (bpm: number) => void;
  readonly onTimeSignatureChange: (timeSignature: TimeSignature) => void;
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
  canDelete,
  onBpmChange,
  onTimeSignatureChange,
  onDelete,
  onConfirm,
  onCancel,
}: TempoMeterMarkerDialogProps): React.JSX.Element {
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
              <input
                type="number"
                value={timeSignature.numerator}
                min={PROJECT_CONSTANTS.minimumTimeSignatureNumerator}
                max={PROJECT_CONSTANTS.maximumTimeSignatureNumerator}
                step={1}
                inputMode="numeric"
                aria-label="Meter numerator"
                onChange={(event) => {
                  const numerator = event.currentTarget.valueAsNumber;

                  if (Number.isSafeInteger(numerator)) {
                    onTimeSignatureChange({
                      ...timeSignature,
                      numerator,
                    });
                  }
                }}
              />
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
