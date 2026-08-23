import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  MAXIMUM_CLIP_NAME_LENGTH,
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
import {
  createShepardMotionController,
} from "../../shared/shepard-motion";
import type {
  ReadonlyRenderSignal,
} from "../../../editor/model/render-signal";
import type {
  PlayheadPosition,
} from "../../../editor/model/playhead-position";
import {
  resolveClipPlayheadVisual,
} from "./clip-playhead-visual";
import {
  CLIP_SHEPARD_SETTINGS,
  createClipShepardCssVariables,
} from "./clip-shepard-settings";

const CLIP_SHEPARD_CSS_VARIABLES = createClipShepardCssVariables(
  CLIP_SHEPARD_SETTINGS,
);

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
  readonly onDelete: (clipId: ClipId) => void;
  readonly onRename: (clipId: ClipId, name: string) => void;
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
              onDelete={onDelete}
              onRename={onRename}
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
  readonly onDelete: (clipId: ClipId) => void;
  readonly onRename: (clipId: ClipId, name: string) => void;
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
  onDelete,
  onRename,
}: ClipCardProps): React.JSX.Element {
  const cardRef = useRef<HTMLElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const nameMeasureRef = useRef<HTMLSpanElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const shepardPlaneRef = useRef<HTMLDivElement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const initiallyOwnsPlayhead = playheadPosition.get().clipId === clip.id;

  useEffect(() => {
    const nameInput = nameInputRef.current;

    if (nameInput === null) {
      return;
    }

    if (renaming) {
      nameInput.focus();
      nameInput.select();
    } else {
      nameInput.value = clip.name;
    }
    if (nameMeasureRef.current !== null) {
      nameMeasureRef.current.textContent = clip.name;
    }
  }, [clip.name, renaming]);

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

  useEffect(() => {
    if (!playing || shepardPlaneRef.current === null) {
      return undefined;
    }

    const shepardMotion = createShepardMotionController(
      shepardPlaneRef.current,
      CLIP_SHEPARD_SETTINGS,
    );
    shepardMotion.start();

    return () => shepardMotion.stop();
  }, [playing]);

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
      >
        <div
          ref={shepardPlaneRef}
          className="clip-playback-shepard-plane"
          style={CLIP_SHEPARD_CSS_VARIABLES as React.CSSProperties}
        />
      </div>
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
        <span
          ref={nameMeasureRef}
          className="clip-name-measure"
          aria-hidden="true"
        >
          {clip.name}
        </span>
        <input
          ref={nameInputRef}
          className="instrument-name-input"
          type="text"
          defaultValue={clip.name}
          maxLength={MAXIMUM_CLIP_NAME_LENGTH}
          readOnly={!renaming}
          tabIndex={renaming ? 0 : -1}
          aria-label={`Name for ${clip.name}`}
          title="Double-click to rename"
          onClick={(event) => {
            event.stopPropagation();

            if (!renaming) {
              event.preventDefault();
              onSelect(clip.id);
            }
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            onSelect(clip.id);
            setRenaming(true);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onInput={(event) => {
            if (nameMeasureRef.current !== null) {
              nameMeasureRef.current.textContent = event.currentTarget.value;
            }
          }}
          onBlur={(event) => {
            if (!renaming) {
              return;
            }

            const nextName = event.currentTarget.value.trim();

            if (nextName.length === 0) {
              event.currentTarget.value = clip.name;
              if (nameMeasureRef.current !== null) {
                nameMeasureRef.current.textContent = clip.name;
              }
            } else if (nextName !== clip.name) {
              onRename(clip.id, nextName);
            }

            setRenaming(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.currentTarget.value = clip.name;
              if (nameMeasureRef.current !== null) {
                nameMeasureRef.current.textContent = clip.name;
              }
              event.currentTarget.blur();
            }
          }}
        />
      </div>
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
        className="instrument-delete-button"
        type="button"
        aria-label={`Delete ${clip.name}`}
        title="Delete clip"
        disabled={clipCount <= 1}
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
}
