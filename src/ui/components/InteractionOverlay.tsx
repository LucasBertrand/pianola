import React, {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import type {
  VoiceId,
} from "../../domain/model";
import {
  CoordinateConverter,
  type ViewportState,
} from "../../geometry/converter";
import {
  SpatialIndex,
} from "../../geometry/spatial-index";
import {
  usePianoRollEvents,
} from "../hooks/usePianoRollEvents";
import type {
  InteractionVisualController,
} from "../interactions/contracts";
import type {
  ReadonlyRenderSignal,
} from "../rendering/render-signal";
import type {
  VoiceRenderStyle,
} from "./PianoRollLayers";

export interface InteractionOverlayProps {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly playheadTick: ReadonlyRenderSignal<number>;
  readonly spatialIndex: SpatialIndex;
  readonly voiceStyles: ReadonlyRenderSignal<
    Readonly<Record<VoiceId, VoiceRenderStyle>>
  >;
  readonly projectStore: ProjectStorePort;
  readonly activeVoiceId: VoiceId;
  readonly gridResolutionTicks: number;
  readonly defaultNoteDurationTicks: number;
}

const INTERACTION_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  touchAction: "none",
  outline: "none",
  cursor: "crosshair",
};

const PLAYHEAD_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  left: 0,
  width: 1,
  background: "#ff4d4d",
  pointerEvents: "none",
  willChange: "transform",
};

const GHOST_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  willChange: "transform",
};

const LASSO_STYLE: CSSProperties = {
  position: "absolute",
  display: "none",
  border: "1px solid rgba(120, 180, 255, 0.95)",
  background: "rgba(80, 150, 255, 0.18)",
  boxShadow: "0 0 0 1px rgba(30, 70, 120, 0.3)",
  pointerEvents: "none",
  boxSizing: "border-box",
  willChange: "transform, width, height",
};

export function InteractionOverlay(
  props: InteractionOverlayProps,
): React.JSX.Element {
  const {
    viewport,
    playheadTick,
    spatialIndex,
    voiceStyles,
    projectStore,
    activeVoiceId,
    gridResolutionTicks,
    defaultNoteDurationTicks,
  } = props;
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const playheadElementRef = useRef<HTMLDivElement | null>(null);
  const ghostLayerRef = useRef<HTMLDivElement | null>(null);
  const lassoElementRef = useRef<HTMLDivElement | null>(null);
  const converterRef = useRef<CoordinateConverter | null>(null);
  const converterVersionRef = useRef(-1);
  const visualsRef = useRef<InteractionVisualController | null>(
    null,
  );

  if (converterRef.current === null) {
    converterRef.current = new CoordinateConverter(viewport.get());
    converterVersionRef.current = viewport.version;
  }

  if (visualsRef.current === null) {
    visualsRef.current = {
      beginDrag(notes, converter, stylesByVoiceId): void {
        const ghostLayer = ghostLayerRef.current;

        if (ghostLayer === null) {
          return;
        }

        ghostLayer.replaceChildren();
        ghostLayer.style.transform = "translate3d(0, 0, 0)";
        const fragment = document.createDocumentFragment();

        for (
          let noteIndex = 0;
          noteIndex < notes.length;
          noteIndex += 1
        ) {
          const note = notes[noteIndex];

          if (note === undefined) {
            continue;
          }

          const element = document.createElement("div");
          const x = converter.tickToCssPixelX(note.startTick);
          const endX = converter.tickToCssPixelX(
            note.startTick + note.durationTicks,
          );
          const y = converter.pitchToCssPixelY(note.pitch);
          const nextY = converter.pitchToCssPixelY(note.pitch - 1);
          const style = stylesByVoiceId[note.voiceId];

          element.className = "interaction-note-ghost";
          element.style.left = `${x}px`;
          element.style.top = `${y}px`;
          element.style.width = `${Math.max(1, endX - x)}px`;
          element.style.height =
            `${Math.max(1, nextY - y - 1)}px`;
          element.style.background =
            style?.fillStyle ?? "#79a7ff";
          fragment.appendChild(element);
        }

        ghostLayer.appendChild(fragment);
      },
      updateDrag(deltaXCssPixels, deltaYCssPixels): void {
        const ghostLayer = ghostLayerRef.current;

        if (ghostLayer !== null) {
          ghostLayer.style.transform =
            `translate3d(${deltaXCssPixels}px, ${deltaYCssPixels}px, 0)`;
        }
      },
      endDrag(): void {
        const ghostLayer = ghostLayerRef.current;

        if (ghostLayer !== null) {
          ghostLayer.replaceChildren();
          ghostLayer.style.transform = "translate3d(0, 0, 0)";
        }
      },
      beginLasso(localX, localY): void {
        const lassoElement = lassoElementRef.current;

        if (lassoElement !== null) {
          lassoElement.style.display = "block";
          lassoElement.style.transform =
            `translate3d(${localX}px, ${localY}px, 0)`;
          lassoElement.style.width = "0px";
          lassoElement.style.height = "0px";
        }
      },
      updateLasso(startX, startY, currentX, currentY): void {
        const lassoElement = lassoElementRef.current;

        if (lassoElement === null) {
          return;
        }

        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        lassoElement.style.transform =
          `translate3d(${left}px, ${top}px, 0)`;
        lassoElement.style.width = `${width}px`;
        lassoElement.style.height = `${height}px`;
      },
      endLasso(): void {
        const lassoElement = lassoElementRef.current;

        if (lassoElement !== null) {
          lassoElement.style.display = "none";
        }
      },
    };
  }

  const getActiveVoiceId = useCallback(
    (): VoiceId => activeVoiceId,
    [activeVoiceId],
  );

  usePianoRollEvents({
    overlayRef,
    visualsRef,
    viewport,
    spatialIndex,
    voiceStyles,
    projectStore,
    getActiveVoiceId,
    gridResolutionTicks,
    defaultNoteDurationTicks,
  });

  useEffect(() => {
    const updatePlayhead = (): void => {
      const converter = converterRef.current;
      const element = playheadElementRef.current;

      if (converter === null || element === null) {
        return;
      }

      if (converterVersionRef.current !== viewport.version) {
        converter.setViewportState(viewport.get());
        converterVersionRef.current = viewport.version;
      }

      const x = converter.tickToCssPixelX(playheadTick.get());
      element.style.transform = `translate3d(${x}px, 0, 0)`;
    };
    const unsubscribePlayhead = playheadTick.subscribe(updatePlayhead);
    const unsubscribeViewport = viewport.subscribe(updatePlayhead);

    updatePlayhead();

    return (): void => {
      unsubscribePlayhead();
      unsubscribeViewport();
    };
  }, [
    playheadTick,
    viewport,
  ]);

  return (
    <div
      ref={overlayRef}
      style={INTERACTION_LAYER_STYLE}
      role="application"
      aria-label="Interactive piano roll"
      tabIndex={0}
    >
      <div
        ref={playheadElementRef}
        style={PLAYHEAD_STYLE}
        aria-hidden="true"
      />
      <div
        ref={ghostLayerRef}
        className="interaction-ghost-layer"
        style={GHOST_LAYER_STYLE}
        aria-hidden="true"
      />
      <div
        ref={lassoElementRef}
        className="interaction-lasso"
        style={LASSO_STYLE}
        aria-hidden="true"
      />
    </div>
  );
}
