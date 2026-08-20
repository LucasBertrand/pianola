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
} from "../../use-cases/piano-roll/notes/note-collision-resolution";
import {
  type InstrumentId,
} from "../../domain/identifiers";
import type {
  ViewportState,
} from "../../editor/geometry/converter";
import type {
  EditingNoteMask,
} from "../../editor/interactions/editing-note-mask";
import {
  useInteractionManager,
} from "./interactions/useInteractionManager";
import {
  usePianoRollEvents,
} from "./interactions/usePianoRollEvents";
import type {
  PianoRollControllerPort,
} from "../../editor/interactions/piano-roll-controller-port";
import type {
  SelectionMode,
} from "../../editor/interactions/gestures/gesture-draft";
import type {
  PointerInteractionStrategy,
} from "../../editor/interactions/pointer/pointer-interaction-strategy";
import type {
  PianoRollRuntimePort,
} from "./piano-roll-runtime-port";
import {
  DomInteractionVisualController,
} from "./interactions/dom-interaction-visual-controller";

export interface InteractionOverlayProps {
  readonly runtime: PianoRollRuntimePort;
  readonly selectionMode: SelectionMode;
  readonly activeInstrumentId: InstrumentId;
  readonly totalTicks: number;
  readonly setViewport: (viewport: ViewportState) => void;
  readonly onHorizontalViewportInteractionStart: () => void;
  readonly onHorizontalViewportInteractionEnd: () => void;
  readonly onTwoFingerDoubleTap: () => void;
  readonly editingNoteMask: EditingNoteMask;
  readonly controllerRef: MutableRefObject<
    PianoRollControllerPort | null
  >;
  readonly onSelectionChange: (
    hasSelection: boolean,
    soleInstrumentId: InstrumentId | null,
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
    activeInstrumentId,
    totalTicks,
    setViewport,
    onHorizontalViewportInteractionStart,
    onHorizontalViewportInteractionEnd,
    onTwoFingerDoubleTap,
    editingNoteMask,
    controllerRef,
    onSelectionChange,
    onGridSeek,
    onNoteCollision,
  } = props;
  const {
    viewport,
    spatialIndex,
    instrumentStyles,
    noteColorMode,
    editorCommands,
    gridResolutionTicks,
    pitchSnapSettings,
    selectionRequests,
    highlightedPitch,
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
    onTwoFingerDoubleTap,
  });

  const controller = usePianoRollEvents({
    overlayRef,
    visualsRef,
    strategyRef,
    viewport,
    spatialIndex,
    instrumentStyles,
    editorCommands,
    activeInstrumentId,
    totalTicks,
    selectionMode,
    gridResolutionTicks,
    pitchSnapSettings,
    selectionRequests,
    highlightedPitch,
    onGridSeek,
    onSelectionChange,
    onNoteCollision,
  });

  useEffect(
    () => {
      controllerRef.current = controller;

      return (): void => {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      };
    },
    [
      controller,
      controllerRef,
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
