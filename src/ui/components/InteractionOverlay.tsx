import React, {
  useEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import {
  APPLICATION_COLORS,
} from "../../config/application-colors";
import type {
  NoteCollisionResolutionRequest,
} from "../../application/note-collision-resolution";
import type {
  VoiceId,
} from "../../domain/model";
import type {
  ViewportState,
} from "../../geometry/converter";
import type {
  EditingNoteMask,
} from "../../interaction/core/editing-note-mask";
import {
  useInteractionManager,
} from "../hooks/useInteractionManager";
import {
  usePianoRollEvents,
} from "../hooks/usePianoRollEvents";
import type {
  PianoRollEventController,
} from "../../interaction/piano-roll-event-controller";
import type {
  SelectionMode,
} from "../../interaction/core/state";
import type {
  PointerInteractionStrategy,
} from "../../interaction/pointer-interaction-strategy";
import type {
  PianoRollRuntimePort,
} from "../contracts/piano-roll-runtime";
import {
  DomInteractionVisualController,
} from "../interactions/dom-interaction-visual-controller";

export interface InteractionOverlayProps {
  readonly runtime: PianoRollRuntimePort;
  readonly selectionMode: SelectionMode;
  readonly activeVoiceId: VoiceId;
  readonly totalTicks: number;
  readonly setViewport: (viewport: ViewportState) => void;
  readonly onHorizontalViewportInteractionStart: () => void;
  readonly onHorizontalViewportInteractionEnd: () => void;
  readonly editingNoteMask: EditingNoteMask;
  readonly eventControllerRef: MutableRefObject<
    PianoRollEventController | null
  >;
  readonly onSelectionChange: (
    hasSelection: boolean,
    soleVoiceId: VoiceId | null,
  ) => void;
  readonly onGridSeek: (tick: number) => void;
  readonly onNoteCollision: (
    request: NoteCollisionResolutionRequest,
  ) => void;
}

const INTERACTION_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  touchAction: "none",
  outline: "none",
  cursor: "crosshair",
};

const GHOST_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  willChange: "transform",
};

const SELECTION_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  willChange: "transform",
};

const LASSO_STYLE: CSSProperties = {
  position: "absolute",
  display: "none",
  border: `1px solid ${APPLICATION_COLORS.interaction.lassoBorder}`,
  background: APPLICATION_COLORS.interaction.lassoFill,
  boxShadow:
    `0 0 0 1px ${APPLICATION_COLORS.interaction.lassoInnerShadow}`,
  pointerEvents: "none",
  boxSizing: "border-box",
  willChange: "transform, width, height",
};

export function InteractionOverlay(
  props: InteractionOverlayProps,
): React.JSX.Element {
  const {
    runtime,
    selectionMode,
    activeVoiceId,
    totalTicks,
    setViewport,
    onHorizontalViewportInteractionStart,
    onHorizontalViewportInteractionEnd,
    editingNoteMask,
    eventControllerRef,
    onSelectionChange,
    onGridSeek,
    onNoteCollision,
  } = props;
  const {
    viewport,
    spatialIndex,
    voiceStyles,
    noteColorMode,
    editorCommands,
    gridResolutionTicks,
    pitchSnapSettings,
    selectionRequests,
  } = runtime;
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const visualsRef = useRef<DomInteractionVisualController | null>(null);
  const strategyRef = useRef<PointerInteractionStrategy | null>(
    null,
  );

  if (visualsRef.current === null) {
    visualsRef.current = new DomInteractionVisualController(
      editingNoteMask,
      noteColorMode,
      pitchSnapSettings,
    );
  }

  const visuals = visualsRef.current;

  useInteractionManager({
    overlayRef,
    strategyRef,
    viewport,
    totalTicks,
    setViewport,
    onHorizontalViewportInteractionStart,
    onHorizontalViewportInteractionEnd,
  });

  const eventController = usePianoRollEvents({
    overlayRef,
    visualsRef,
    strategyRef,
    viewport,
    spatialIndex,
    voiceStyles,
    editorCommands,
    activeVoiceId,
    totalTicks,
    selectionMode,
    gridResolutionTicks,
    pitchSnapSettings,
    selectionRequests,
    onGridSeek,
    onSelectionChange,
    onNoteCollision,
  });

  useEffect(
    () => {
      eventControllerRef.current = eventController;

      return (): void => {
        if (eventControllerRef.current === eventController) {
          eventControllerRef.current = null;
        }
      };
    },
    [
      eventController,
      eventControllerRef,
    ],
  );

  return (
    <div
      ref={overlayRef}
      className="interaction-overlay"
      style={INTERACTION_LAYER_STYLE}
      role="application"
      aria-label="Interactive piano roll"
    >
      <div
        ref={(element) => {
          visuals.setGhostLayer(element);
        }}
        className="interaction-ghost-layer"
        style={GHOST_LAYER_STYLE}
        aria-hidden="true"
      />
      <div
        ref={(element) => {
          visuals.setSelectionLayer(element);
        }}
        className="interaction-selection-layer"
        style={SELECTION_LAYER_STYLE}
        aria-hidden="true"
      />
      <div
        ref={(element) => {
          visuals.setLassoElement(element);
        }}
        className="interaction-lasso"
        style={LASSO_STYLE}
        aria-hidden="true"
      />
    </div>
  );
}
