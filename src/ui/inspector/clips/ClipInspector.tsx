import React, {
  useEffect,
  useRef,
} from "react";
import {
  MAXIMUM_PROJECT_CLIP_COUNT,
  type Clip,
} from "../../../domain/clips/clip";
import {
  type ClipId,
} from "../../../domain/identifiers";
import {
  type ProjectState,
} from "../../../domain/project/project-document";
import {
  useCardReorder,
} from "../../shared/useCardReorder";
import type {
  ReadonlyRenderSignal,
} from "../../../editor/model/render-signal";
import type {
  PlayheadPosition,
} from "../../../editor/model/playhead-position";
import {
  resolveClipPlayheadVisual,
} from "./clip-playhead-visual";

export interface ClipInspectorProps {
  readonly projectState: ProjectState;
  readonly playingClipId: ClipId | null;
  readonly playheadPosition: ReadonlyRenderSignal<PlayheadPosition>;
  readonly suppressSelectionHighlight: boolean;
  readonly onSelect: (clipId: ClipId) => void;
  readonly onTogglePlayback: (clipId: ClipId) => void;
  readonly onAdd: () => void;
  readonly onDuplicate: (clipId: ClipId) => void;
  readonly onReorder: (clipId: ClipId, targetIndex: number) => void;
  readonly onSelectNotes: (clipId: ClipId) => void;
  readonly onEdit: (clipId: ClipId) => void;
}

export function ClipInspector({
  projectState,
  playingClipId,
  playheadPosition,
  suppressSelectionHighlight,
  onSelect,
  onTogglePlayback,
  onAdd,
  onDuplicate,
  onReorder,
  onSelectNotes,
  onEdit,
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
          return (
            <ClipCard
              key={clip.id}
              clip={clip}
              clipIndex={clipIndex}
              selected={
                clip.id === projectState.workspace.activeClipId
                && !suppressSelectionHighlight
              }
              playing={clip.id === playingClipId}
              playheadPosition={playheadPosition}
              clipCount={projectState.clipOrder.length}
              reorder={reorder}
              onSelect={onSelect}
              onTogglePlayback={onTogglePlayback}
              onDuplicate={onDuplicate}
              onReorder={onReorder}
              onSelectNotes={onSelectNotes}
              onEdit={onEdit}
            />
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

interface ClipCardProps {
  readonly clip: Clip;
  readonly clipIndex: number;
  readonly selected: boolean;
  readonly playing: boolean;
  readonly playheadPosition: ReadonlyRenderSignal<PlayheadPosition>;
  readonly clipCount: number;
  readonly reorder: ReturnType<typeof useCardReorder>;
  readonly onSelect: (clipId: ClipId) => void;
  readonly onTogglePlayback: (clipId: ClipId) => void;
  readonly onDuplicate: (clipId: ClipId) => void;
  readonly onReorder: (clipId: ClipId, targetIndex: number) => void;
  readonly onSelectNotes: (clipId: ClipId) => void;
  readonly onEdit: (clipId: ClipId) => void;
}

function ClipCard({
  clip,
  clipIndex,
  selected,
  playing,
  playheadPosition,
  clipCount,
  reorder,
  onSelect,
  onTogglePlayback,
  onDuplicate,
  onReorder,
  onSelectNotes,
  onEdit,
}: ClipCardProps): React.JSX.Element {
  const cardRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const initiallyOwnsPlayhead = playheadPosition.get().clipId === clip.id;

  useEffect(() => {
    const publishProgress = (): void => {
      const visual = resolveClipPlayheadVisual(
        clip.id,
        clip.timeline.durationTicks,
        playheadPosition.get(),
      );

      cardRef.current?.classList.toggle("has-playhead", visual.present);

      if (progressRef.current !== null) {
        progressRef.current.style.clipPath =
          `inset(0 ${String((1 - visual.progress) * 100)}% 0 0)`;
      }
    };
    const unsubscribe = playheadPosition.subscribe(publishProgress);

    publishProgress();
    return unsubscribe;
  }, [clip.id, clip.timeline.durationTicks, playheadPosition]);



  return (
    <article
      ref={cardRef}
      className={
        `project-instrument-card clip-card${
          selected ? " is-selected" : ""
        }${playing ? " is-playing" : ""}${
          initiallyOwnsPlayhead ? " has-playhead" : ""
        }`
      }
      data-reorder-index={clipIndex}
      style={{
        "--instrument-color": clip.color,
      } as React.CSSProperties}
      onClick={() => onSelect(clip.id)}
    >
      <div
        className="clip-playhead-background"
        aria-hidden="true"
      />
      <div
        ref={progressRef}
        className="clip-playback-progress"
        aria-hidden="true"
      />
      <button
        className="clip-reorder-handle reorder-handle"
        aria-label={`Move ${clip.name}`}
        type="button"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          const direction = event.key === "ArrowUp"
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
        <strong className="instrument-name">{clip.name}</strong>
      </div>
      <button
        className="instrument-select-all-button clip-select-all-button"
        type="button"
        aria-label={`Select all notes from ${clip.name}`}
        title="Select all clip notes"
        onClick={(event) => {
          event.stopPropagation();
          onSelectNotes(clip.id);
        }}
      >
        <svg
          className="instrument-select-all-icon"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="7" />
          <circle cx="10" cy="10" r="3" />
          <path d="M10 1v3M10 16v3M1 10h3M16 10h3" />
        </svg>
      </button>
      <button
        className={`clip-play-button${playing ? " is-active" : ""}`}
        type="button"
        aria-label={`${playing ? "Stop" : "Play"} ${clip.name}`}
        title={playing ? "Stop clip" : "Play clip immediately"}
        aria-pressed={playing}
        onClick={(event) => {
          event.stopPropagation();
          onTogglePlayback(clip.id);
        }}
      >
        {playing ? (
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="6" y="6" width="8" height="8" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7 5.5v9l7-4.5Z" />
          </svg>
        )}
      </button>
      <button
        className="instrument-duplicate-button"
        type="button"
        aria-label={`Duplicate ${clip.name}`}
        title="Duplicate clip"
        disabled={clipCount >= MAXIMUM_PROJECT_CLIP_COUNT}
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
        className="instrument-settings-button clip-settings-button"
        type="button"
        aria-label={`Edit ${clip.name}`}
        title="Edit clip"
        onClick={(event) => {
          event.stopPropagation();
          onEdit(clip.id);
        }}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="3" />
          <path d="M8.3 2.5h3.4l.5 2a6 6 0 0 1 1.3.8l2-.6 1.7 3-1.5 1.4a6 6 0 0 1 0 1.8l1.5 1.4-1.7 3-2-.6a6 6 0 0 1-1.3.8l-.5 2H8.3l-.5-2a6 6 0 0 1-1.3-.8l-2 .6-1.7-3 1.5-1.4a6 6 0 0 1 0-1.8L2.8 7.7l1.7-3 2 .6a6 6 0 0 1 1.3-.8Z" />
        </svg>
      </button>
    </article>
  );
}
