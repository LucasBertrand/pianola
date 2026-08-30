import React from "react";

import {
  PROJECT_CONSTANTS,
} from "../../domain/project/project-constants";
import { PITCH_SNAP_CONSTANTS } from "../../domain/music-theory/pitch-snap-constants";
import {
  CHORD_PATTERN_GROUPS,
  formatChordSymbol,
  SCALE_PATTERN_GROUPS,
  type PitchPatternGroup,
} from "../../domain/music-theory/pitch-pattern-catalog";
import { formatAccidentals } from "../../domain/music-theory/pitch-notation";
import type {
  TimeSignature,
} from "../../domain/transport/time-map";
import type { PitchPatternType } from "../../domain/music-theory/pitch-snap";

const DENOMINATOR_OPTIONS = [1, 2, 4, 8, 16, 32] as const;

export interface TempoMeterMarkerDialogProps {
  readonly mode: "create" | "edit";
  readonly tempoIncluded: boolean;
  readonly meterIncluded: boolean;
  readonly scaleIncluded: boolean;
  readonly sectionIncluded: boolean;
  readonly canChangeMarkerTypes: boolean;
  readonly bpm: number;
  readonly timeSignature: TimeSignature | null;
  readonly rootNote: string;
  readonly patternType: PitchPatternType;
  readonly patternId: string;
  readonly sectionComment: string;
  readonly onTempoIncludedChange: (included: boolean) => void;
  readonly onMeterIncludedChange: (included: boolean) => void;
  readonly onScaleIncludedChange: (included: boolean) => void;
  readonly onSectionIncludedChange: (included: boolean) => void;
  readonly onBpmChange: (bpm: number) => void;
  readonly onTimeSignatureChange: (timeSignature: TimeSignature) => void;
  readonly onRootNoteChange: (rootNote: string) => void;
  readonly onPatternTypeChange: (patternType: PitchPatternType) => void;
  readonly onPatternIdChange: (patternId: string) => void;
  readonly onSectionCommentChange: (comment: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** Draft-only marker dialog; the document mutates only when it is confirmed. */
export function TempoMeterMarkerDialog({
  mode,
  tempoIncluded,
  meterIncluded,
  scaleIncluded,
  sectionIncluded,
  canChangeMarkerTypes,
  bpm,
  timeSignature,
  rootNote,
  patternType,
  patternId,
  sectionComment,
  onTempoIncludedChange,
  onMeterIncludedChange,
  onScaleIncludedChange,
  onSectionIncludedChange,
  onBpmChange,
  onTimeSignatureChange,
  onRootNoteChange,
  onPatternTypeChange,
  onPatternIdChange,
  onSectionCommentChange,
  onConfirm,
  onCancel,
}: TempoMeterMarkerDialogProps): React.JSX.Element {
  const hasIncludedType = tempoIncluded
    || meterIncluded
    || scaleIncluded
    || sectionIncluded;

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
            {mode === "create" ? "Add marker" : "Edit marker"}
          </h2>
        </div>

        <p className="tempo-meter-marker-dialog-intro">
          {mode === "create"
            ? "Choose the marker types to add at this position."
            : "Choose the marker types to keep at this position."}
        </p>

        <div className="tempo-meter-marker-components">
          <section
            className={`tempo-meter-marker-component${tempoIncluded ? " is-included" : ""}`}
          >
            <label className="tempo-meter-marker-component-toggle">
              <input
                type="checkbox"
                checked={tempoIncluded}
                disabled={!canChangeMarkerTypes}
                autoFocus
                onChange={(event) => {
                  onTempoIncludedChange(event.currentTarget.checked);
                }}
              />
              <span>Tempo</span>
            </label>
            {tempoIncluded ? (
              <div className="tempo-meter-marker-component-details">
                <label className="instrument-preset-dialog-control">
                  <span>Tempo (BPM)</span>
                  <input
                    type="number"
                    value={bpm}
                    min={PROJECT_CONSTANTS.minimumTempoBpm}
                    max={PROJECT_CONSTANTS.maximumTempoBpm}
                    step={PROJECT_CONSTANTS.tempoStepBpm}
                    inputMode="decimal"
                    aria-label="Marker tempo in beats per minute"
                    onChange={(event) => {
                      onBpmChange(event.currentTarget.valueAsNumber);
                    }}
                  />
                </label>
              </div>
            ) : null}
          </section>

          {timeSignature !== null ? (
            <section
              className={`tempo-meter-marker-component${meterIncluded ? " is-included" : ""}`}
            >
              <label className="tempo-meter-marker-component-toggle">
                <input
                  type="checkbox"
                  checked={meterIncluded}
                  disabled={!canChangeMarkerTypes}
                  onChange={(event) => {
                    onMeterIncludedChange(event.currentTarget.checked);
                  }}
                />
                <span>Meter</span>
              </label>
              {meterIncluded ? (
                <div className="tempo-meter-marker-component-details">
                  <div className="instrument-preset-dialog-control">
                    <span>Time signature</span>
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
                          (_, index) => index + 1,
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
                </div>
              ) : null}
            </section>
          ) : null}

          <section
            className={`tempo-meter-marker-component${scaleIncluded ? " is-included" : ""}`}
          >
            <label className="tempo-meter-marker-component-toggle">
              <input
                type="checkbox"
                checked={scaleIncluded}
                disabled={!canChangeMarkerTypes}
                onChange={(event) => {
                  onScaleIncludedChange(event.currentTarget.checked);
                }}
              />
              <span>Scale / chord</span>
            </label>
            {scaleIncluded ? (
              <div className="tempo-meter-marker-component-details">
                <label className="instrument-preset-dialog-control">
                  <span>Root</span>
                  <select
                    value={rootNote}
                    aria-label="Root pitch class"
                    onChange={(event) => {
                      const newRoot = event.currentTarget.value;
                      const oldRoot = rootNote;
                      onRootNoteChange(newRoot);
                      if (newRoot === "none") {
                        onPatternTypeChange("scale");
                        onPatternIdChange("chromatic");
                      } else if (oldRoot === "none") {
                        onPatternTypeChange("scale");
                        onPatternIdChange(
                          PITCH_SNAP_CONSTANTS.defaultScalePatternId,
                        );
                      }
                    }}
                  >
                    {PITCH_SNAP_CONSTANTS.rootOptions.map((option) => (
                      <option key={option} value={option}>
                        {formatAccidentals(option)}
                      </option>
                    ))}
                  </select>
                </label>

                {rootNote !== "none" ? (
                  <>
                    <label className="instrument-preset-dialog-control">
                      <span>Type</span>
                      <select
                        value={patternType}
                        aria-label="Pattern type"
                        onChange={(event) => {
                          const newType = event.currentTarget.value as PitchPatternType;
                          onPatternTypeChange(newType);
                          if (newType === "scale") {
                            onPatternIdChange(
                              PITCH_SNAP_CONSTANTS.defaultScalePatternId,
                            );
                          } else {
                            onPatternIdChange(
                              PITCH_SNAP_CONSTANTS.defaultChordPatternId,
                            );
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
                        aria-label="Pitch pattern"
                        onChange={(event) => {
                          onPatternIdChange(event.currentTarget.value);
                        }}
                      >
                        <PitchPatternOptions
                          groups={patternType === "scale"
                            ? SCALE_PATTERN_GROUPS
                            : CHORD_PATTERN_GROUPS}
                          chordRootNote={patternType === "chord"
                            ? rootNote
                            : null}
                        />
                      </select>
                    </label>
                  </>
                ) : null}
              </div>
            ) : null}
          </section>

          <section
            className={`tempo-meter-marker-component${sectionIncluded ? " is-included" : ""}`}
          >
            <label className="tempo-meter-marker-component-toggle">
              <input
                type="checkbox"
                checked={sectionIncluded}
                onChange={(event) => {
                  onSectionIncludedChange(event.currentTarget.checked);
                }}
              />
              <span>Section</span>
            </label>
            {sectionIncluded ? (
              <div className="tempo-meter-marker-component-details">
                <label className="instrument-preset-dialog-control">
                  <span>Comment</span>
                  <textarea
                    value={sectionComment}
                    maxLength={1_000}
                    rows={3}
                    required
                    aria-label="Section marker comment"
                    onChange={(event) => {
                      onSectionCommentChange(event.currentTarget.value);
                    }}
                  />
                </label>
              </div>
            ) : null}
          </section>
        </div>

        {!canChangeMarkerTypes ? (
          <p className="tempo-meter-marker-dialog-note">
            The initial tempo, meter, and scale markers are required.
          </p>
        ) : null}

        <div className="application-dialog-actions">
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
            disabled={mode === "create" && !hasIncludedType}
          >
            {mode === "create" ? "Add marker" : "Apply"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PitchPatternOptions({
  groups,
  chordRootNote,
}: {
  readonly groups: readonly PitchPatternGroup[];
  readonly chordRootNote: string | null;
}): React.JSX.Element {
  return (
    <>
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((option) => (
            <option key={option.id} value={option.id}>
              {chordRootNote === null
                ? option.label
                : formatChordSymbol(chordRootNote, option.id)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
