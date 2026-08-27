import React, { useMemo, useState } from "react";
import {
  MAXIMUM_PROJECT_CLIP_COUNT,
  type Clip,
} from "../../domain/clips/clip";
import type {
  ClipSplitStrategy,
} from "../../domain/clips/split-clip";
import type { Tick } from "../../domain/identifiers";
import {
  getMeasureSpans,
  isMeasureBoundary,
} from "../../domain/transport/time-map";
import type { ProjectClock } from "../../domain/transport/transport";

export interface ClipSplitDialogProps {
  readonly clip: Clip;
  readonly clock: ProjectClock;
  readonly projectClipCount: number;
  readonly canCreateGroup: boolean;
  readonly onConfirm: (strategy: ClipSplitStrategy) => void;
  readonly onCancel: () => void;
}

/** Selects a split strategy without mutating the source clip. */
export function ClipSplitDialog({
  clip,
  clock,
  projectClipCount,
  canCreateGroup,
  onConfirm,
  onCancel,
}: ClipSplitDialogProps): React.JSX.Element {
  const measureSpans = useMemo(() => getMeasureSpans(
    clock.ppqn,
    clip.timeline.timeMap,
    clip.timeline.durationTicks,
  ), [clip.timeline, clock.ppqn]);
  const eligibleSectionMarkers = useMemo(
    () => clip.timeline.timeMap.sectionMarkers.filter((marker) => (
      isMeasureBoundary(
        clock.ppqn,
        clip.timeline.timeMap,
        clip.timeline.durationTicks,
        marker.startTick,
      )
    )),
    [clip.timeline, clock.ppqn],
  );
  const [mode, setMode] = useState<ClipSplitStrategy["type"]>("measures");
  const [selectedSectionMarkerTicks, setSelectedSectionMarkerTicks] = useState(
    () => new Set<Tick>(eligibleSectionMarkers.map((marker) => marker.startTick)),
  );
  const generatedClipCount = mode === "measures"
    ? measureSpans.length
    : selectedSectionMarkerTicks.size + 1;
  const exceedsClipLimit =
    projectClipCount - 1 + generatedClipCount > MAXIMUM_PROJECT_CLIP_COUNT;
  const canConfirm =
    generatedClipCount >= 2
    && canCreateGroup
    && !exceedsClipLimit;

  const strategy = (): ClipSplitStrategy => mode === "measures"
    ? { type: "measures" }
    : {
        type: "section-markers",
        selectedSectionMarkerTicks: [...selectedSectionMarkerTicks]
          .sort((left, right) => left - right),
      };

  return (
    <div className="application-dialog-backdrop instrument-editor-backdrop">
      <form
        className="application-dialog clip-split-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clip-split-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();

          if (canConfirm) {
            onConfirm(strategy());
          }
        }}
      >
        <div className="application-dialog-heading">
          <span className="application-dialog-mark" aria-hidden="true">÷</span>
          <h2 id="clip-split-dialog-title">Split {clip.name}</h2>
        </div>

        <fieldset className="clip-split-strategies">
          <legend>Split strategy</legend>
          <label className="clip-split-strategy">
            <input
              type="radio"
              name="clip-split-strategy"
              value="measures"
              checked={mode === "measures"}
              onChange={() => setMode("measures")}
            />
            <span>
              <strong>Individual measures</strong>
              <small>Generate one clip for every measure.</small>
            </span>
          </label>
          <label className="clip-split-strategy">
            <input
              type="radio"
              name="clip-split-strategy"
              value="section-markers"
              checked={mode === "section-markers"}
              disabled={eligibleSectionMarkers.length === 0}
              onChange={() => setMode("section-markers")}
            />
            <span>
              <strong>Section markers</strong>
              <small>Use selected markers on measure boundaries.</small>
            </span>
          </label>
        </fieldset>

        {mode !== "section-markers" ? null : (
          <fieldset className="clip-split-section-markers">
            <legend>Section markers</legend>
            <div className="clip-split-section-marker-list">
              {eligibleSectionMarkers.map((marker) => {
                const measureIndex = measureSpans.findIndex(
                  (span) => span.startTick === marker.startTick,
                );

                return (
                  <label key={marker.startTick}>
                    <input
                      type="checkbox"
                      checked={selectedSectionMarkerTicks.has(marker.startTick)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;

                        setSelectedSectionMarkerTicks((current) => {
                          const next = new Set(current);

                          if (checked) {
                            next.add(marker.startTick);
                          } else {
                            next.delete(marker.startTick);
                          }

                          return next;
                        });
                      }}
                    />
                    <span>
                      <strong>{marker.comment}</strong>
                      <small>Measure {measureIndex + 1}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <output className="clip-split-count" aria-live="polite">
          {generatedClipCount} {generatedClipCount === 1 ? "clip" : "clips"} will be generated.
        </output>
        {!canCreateGroup ? (
          <p className="clip-split-warning">The project has reached its group limit.</p>
        ) : exceedsClipLimit ? (
          <p className="clip-split-warning">This split would exceed the project clip limit.</p>
        ) : generatedClipCount < 2 ? (
          <p className="clip-split-warning">Select at least one split point.</p>
        ) : null}

        <div className="application-dialog-actions">
          <button
            className="application-dialog-button is-neutral"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="application-dialog-button is-primary"
            type="submit"
            disabled={!canConfirm}
          >
            Split clip
          </button>
        </div>
      </form>
    </div>
  );
}
