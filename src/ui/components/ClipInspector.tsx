import React from "react";
import {
  MAXIMUM_CLIP_NAME_LENGTH,
  MAXIMUM_PROJECT_CLIP_COUNT,
  type ClipId,
  type ProjectState,
} from "../../domain/model";
import {
  LongPressNameEditor,
} from "./LongPressNameEditor";

export interface ClipInspectorProps {
  readonly projectState: ProjectState;
  readonly onClose: () => void;
  readonly onSelect: (clipId: ClipId) => void;
  readonly onAdd: () => void;
  readonly onDuplicate: (clipId: ClipId) => void;
  readonly onMoveActive: (direction: -1 | 1) => void;
  readonly onDelete: (clipId: ClipId) => void;
  readonly onRename: (clipId: ClipId, name: string) => void;
}

export function ClipInspector({
  projectState,
  onClose,
  onSelect,
  onAdd,
  onDuplicate,
  onMoveActive,
  onDelete,
  onRename,
}: ClipInspectorProps): React.JSX.Element {
  const activeIndex = projectState.clipOrder.indexOf(
    projectState.activeClipId,
  );

  return (
    <section className="clip-inspector-section">
      <div className="general-inspector-heading">
        <div>
          <h1>Clips</h1>
        </div>
        <div className="general-inspector-heading-actions">
          <button
            className="instrument-order-button"
            type="button"
            aria-label="Move selected clip up"
            title="Move selected clip up"
            disabled={activeIndex <= 0}
            onClick={() => onMoveActive(-1)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 15V5M5.5 9.5 10 5l4.5 4.5" />
            </svg>
          </button>
          <button
            className="instrument-order-button"
            type="button"
            aria-label="Move selected clip down"
            title="Move selected clip down"
            disabled={
              activeIndex < 0
              || activeIndex >= projectState.clipOrder.length - 1
            }
            onClick={() => onMoveActive(1)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 5v10M5.5 10.5 10 15l4.5-4.5" />
            </svg>
          </button>
          <button
            className="general-inspector-close-button"
            type="button"
            aria-label="Close inspector"
            onClick={onClose}
          >
            ×
          </button>
          <button
            className="add-button"
            type="button"
            aria-label="Add clip"
            title="Add clip"
            disabled={
              projectState.clipOrder.length >= MAXIMUM_PROJECT_CLIP_COUNT
            }
            onClick={onAdd}
          >
            +
          </button>
        </div>
      </div>

      <div className="instrument-list clip-list">
        {projectState.clipOrder.map((clipId, clipIndex) => {
          const clip = projectState.clipsById[clipId];

          if (clip === undefined) {
            return null;
          }

          return (
            <article
              className={
                `project-instrument-card clip-card${
                  clip.id === projectState.activeClipId
                    ? " is-selected"
                    : ""
                }`
              }
              key={clip.id}
              onClick={() => onSelect(clip.id)}
            >
              <span className="clip-order-index" aria-hidden="true">
                {clipIndex + 1}
              </span>
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
                  {clip.measureCount} measures {clip.transportSettings.timeSignature.numerator}/
                  {clip.transportSettings.timeSignature.denominator}
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
                  <rect x="6.5" y="6.5" width="9" height="9" rx="1.5" />
                  <path d="M4 13.5H3.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1V4" />
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
                ×
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
