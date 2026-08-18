import React from "react";
import {
  PROJECT_CONSTANTS,
} from "../../config/domain-limits";
import type {
  TimeSignature,
} from "../../domain/transport/time-map";
import { TONAL_SNAP_CONSTANTS } from "../../config/music-config";
import type { TonalPatternType } from "../../music/pitch-snap";

import { ScaleType, ChordType } from "@tonaljs/tonal";

const DENOMINATOR_OPTIONS = [1, 2, 4, 8, 16, 32] as const;

export interface TempoMeterMarkerDialogProps {
  readonly mode: "create" | "edit";
  readonly measureIndex: number | null;
  readonly bpm: number;
  readonly timeSignature: TimeSignature | null;
  readonly rootNote: string;
  readonly patternType: TonalPatternType;
  readonly patternId: string;
  readonly canDelete: boolean;
  readonly onBpmChange: (bpm: number) => void;
  readonly onTimeSignatureChange: (timeSignature: TimeSignature) => void;
  readonly onRootNoteChange: (rootNote: string) => void;
  readonly onPatternTypeChange: (patternType: TonalPatternType) => void;
  readonly onPatternIdChange: (patternId: string) => void;
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
  rootNote,
  patternType,
  patternId,
  canDelete,
  onBpmChange,
  onTimeSignatureChange,
  onRootNoteChange,
  onPatternTypeChange,
  onPatternIdChange,
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
        <div className="application-dialog-heading" style={{ marginBottom: "1rem" }}>
          <span className="application-dialog-mark" aria-hidden="true">
            {mode === "create" ? "+" : "~"}
          </span>
          <h2 id="tempo-meter-marker-dialog-title">
            {mode === "create"
              ? measureIndex !== null
                ? `Add marker at measure ${String(measureIndex + 1)}`
                : "Add marker"
              : measureIndex !== null
                ? `Edit marker at measure ${String(measureIndex + 1)}`
                : "Edit marker"}
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
          <span>Root</span>
          <select
            value={rootNote}
            aria-label="Root pitch class"
            onChange={(event) => {
              onRootNoteChange(event.currentTarget.value);
            }}
          >
            {TONAL_SNAP_CONSTANTS.rootOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>

        <label className="instrument-preset-dialog-control">
          <span>Type</span>
          <select
            value={patternType}
            aria-label="Pattern type"
            onChange={(event) => {
              const newType = event.currentTarget.value as TonalPatternType;
              onPatternTypeChange(newType);
              if (newType === "scale") {
                onPatternIdChange(TONAL_SNAP_CONSTANTS.supportedScales[0]);
              } else {
                onPatternIdChange(TONAL_SNAP_CONSTANTS.supportedChords[0]);
              }
            }}
          >
            <option value="scale">Gamme</option>
            <option value="chord">Accord</option>
          </select>
        </label>

        <label className="instrument-preset-dialog-control">
          <span>{patternType === "scale" ? "Scale" : "Chord"}</span>
          <select
            value={patternId}
            aria-label="Tonal pattern"
            onChange={(event) => {
              onPatternIdChange(event.currentTarget.value);
            }}
          >
            {patternType === "scale" ? (
              TONAL_SNAP_CONSTANTS.supportedScales.map((scaleId) => {
                const scale = ScaleType.get(scaleId);
                return (
                  <option key={scaleId} value={scaleId}>
                    {scaleId}
                  </option>
                );
              })
            ) : (
              TONAL_SNAP_CONSTANTS.supportedChords.map((chordId) => {
                const chord = ChordType.get(chordId);
                return (
                  <option key={chordId} value={chordId}>
                    {chord.aliases[0] ?? chordId} ({chord.name})
                  </option>
                );
              })
            )}
          </select>
        </label>

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
