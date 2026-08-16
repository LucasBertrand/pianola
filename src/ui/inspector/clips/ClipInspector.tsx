import React from "react";
import {
  MAXIMUM_CLIP_NAME_LENGTH,
  MAXIMUM_PROJECT_CLIP_COUNT,
} from "../../../domain/clips/clip";
import {
  getMeasureCount,
  getMeterAtTick,
} from "../../../domain/transport/time-map";
import {
  type ClipId,
} from "../../../domain/identifiers";
import {
  type ProjectState,
} from "../../../domain/project/project-document";
import {
  LongPressNameEditor,
} from "../../shared/LongPressNameEditor";
import {
  useCardReorder,
} from "../../shared/useCardReorder";

export interface ClipInspectorProps {
  readonly projectState: ProjectState;
  readonly onSelect: (clipId: ClipId) => void;
  readonly onAdd: () => void;
  readonly onDuplicate: (clipId: ClipId) => void;
  readonly onReorder: (clipId: ClipId, targetIndex: number) => void;
  readonly onDelete: (clipId: ClipId) => void;
  readonly onRename: (clipId: ClipId, name: string) => void;
}

export function ClipInspector({
  projectState,
  onSelect,
  onAdd,
  onDuplicate,
  onReorder,
  onDelete,
  onRename,
}: ClipInspectorProps): React.JSX.Element {
  const reorder = useCardReorder(projectState.clipOrder, onReorder);

  return (
    <section className="clip-inspector-section">
      <div className="instrument-list clip-list">
        {projectState.clipOrder.map((clipId, clipIndex) => {
          const clip = projectState.clipsById[clipId];

          if (clip === undefined) {
            return null;
          }
          const timeSignature = getMeterAtTick(
            clip.timeline.timeMap,
            0,
          );

          return (
            <article
              className={
                `project-instrument-card clip-card${
                  clip.id === projectState.workspace.activeClipId
                    ? " is-selected"
                    : ""
                }`
              }
              key={clip.id}
              data-reorder-index={clipIndex}
              onClick={() => onSelect(clip.id)}
            >
              <button
                className="clip-reorder-handle reorder-handle"
                aria-label={`Move ${clip.name}`}
                type="button"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  const direction =
                    event.key === "ArrowUp"
                      ? -1
                      : event.key === "ArrowDown"
                        ? 1
                        : 0;

                  if (direction !== 0) {
                    event.preventDefault();
                    onReorder(clip.id, clipIndex + direction);
                  }
                }}
                onPointerDown={(event) => reorder.begin(clip.id, event)}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <circle cx="7" cy="6" r="1" />
                  <circle cx="13" cy="6" r="1" />
                  <circle cx="7" cy="10" r="1" />
                  <circle cx="13" cy="10" r="1" />
                  <circle cx="7" cy="14" r="1" />
                  <circle cx="13" cy="14" r="1" />
                </svg>
              </button>
              <div className="instrument-copy">
                <LongPressNameEditor
                  entityId={clip.id}
                  name={clip.name}
                  maximumLength={MAXIMUM_CLIP_NAME_LENGTH}
                  className="instrument-name-input"
                  onSelect={onSelect}
                  onRename={(name) => onRename(clip.id, name)}
                />
                <small>
                  {getMeasureCount(
                    projectState.clock.ppqn,
                    clip.timeline.timeMap,
                    clip.timeline.durationTicks,
                  )} measures {timeSignature.numerator}/
                  {timeSignature.denominator}
                </small>
              </div>
              <button
                className="instrument-duplicate-button"
                type="button"
                aria-label={`Duplicate ${clip.name}`}
                title="Duplicate clip"
                disabled={
                  projectState.clipOrder.length
                    >= MAXIMUM_PROJECT_CLIP_COUNT
                }
                onClick={(event) => {
                  event.stopPropagation();
                  onDuplicate(clip.id);
                }}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <rect x="7" y="7" width="9" height="9" rx="1.5" />
                  <path d="M4 13V5.5A1.5 1.5 0 0 1 5.5 4H13" />
                  <path d="M11.5 9.5v4M9.5 11.5h4" />
                </svg>
              </button>
              <button
                className="instrument-delete-button"
                type="button"
                aria-label={`Delete ${clip.name}`}
                title="Delete clip"
                disabled={projectState.clipOrder.length <= 1}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(clip.id);
                }}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M4.5 6h11M8 6l.5-2h3L12 6" />
                  <path d="m6 6 .7 10h6.6L14 6M8.5 9v4M11.5 9v4" />
                </svg>
              </button>
            </article>
          );
        })}
        <button
          className="add-card"
          type="button"
          aria-label="Add clip"
          disabled={
            projectState.clipOrder.length >= MAXIMUM_PROJECT_CLIP_COUNT
          }
          onClick={onAdd}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 4v12M4 10h12" />
          </svg>
          <span>Add clip</span>
        </button>
      </div>
    </section>
  );
}
