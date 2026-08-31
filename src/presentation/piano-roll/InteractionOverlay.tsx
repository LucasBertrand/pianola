import React, {
  useEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
  type RefObject,
} from "react";
import type {
  NoteCollisionResolutionRequest,
} from "../../application/piano-roll/notes/note-collision-resolution";
import type {
  MarkerCollisionResolutionRequest,
} from "../../application/piano-roll/timeline/marker-collision-resolution";
import {
  type InstrumentId,
} from "../../domain/identifiers";
import type {
  ViewportState,
} from "../../editor-core/geometry/converter";
import type {
  EditingNoteMask,
} from "../../editor-core/interactions/editing-note-mask";
import {
  useInteractionManager,
} from "./interactions/useInteractionManager";
import {
  usePianoRollEvents,
} from "./interactions/usePianoRollEvents";
import type {
  PianoRollControllerPort,
} from "../../editor-core/interactions/piano-roll-controller-port";
import type {
  SelectionMode,
} from "../../editor-core/interactions/gestures/gesture-draft";
import type {
  PointerInteractionStrategy,
} from "../../editor-core/interactions/pointer/pointer-interaction-strategy";
import type {
  PianoRollRuntimePort,
} from "./piano-roll-runtime-port";
import {
  DomInteractionVisualController,
} from "./interactions/dom-interaction-visual-controller";
import type {
  ViewportPoint,
} from "../radial-menu/floating-radial-menu-model";

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
  readonly interactionStrategyRef: MutableRefObject<
    PointerInteractionStrategy | null
  >;
  readonly onSelectionChange: (
    hasSelection: boolean,
    soleInstrumentId: InstrumentId | null,
  ) => void;
  readonly onGridSeek: (tick: number) => void;
  readonly onOpenContextMenu: (position: ViewportPoint) => void;
  readonly onNoteCollision: (
    request: NoteCollisionResolutionRequest,
  ) => void;
  readonly onMarkerCollision: (
    request: MarkerCollisionResolutionRequest,
  ) => void;
  readonly globalLassoRef: RefObject<HTMLDivElement | null>;
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
    interactionStrategyRef,
    onSelectionChange,
    onGridSeek,
    onOpenContextMenu,
    onNoteCollision,
    onMarkerCollision,
    globalLassoRef,
  } = props;
  const {
    viewport,
    spatialIndex,
    instrumentStyles,
    noteColorMode,
    projectStore,
    editorCommands,
    selection,
    gridResolutionTicks,
    pitchSnapSettings,
    selectionRequests,
    highlightedPitch,
    timeMapMarkerPreview,
  } = runtime;
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const visualsRef = useRef<DomInteractionVisualController | null>(null);

  if (visualsRef.current === null) {
    visualsRef.current = new DomInteractionVisualController(
      editingNoteMask,
      noteColorMode,
      instrumentStyles,
      editorCommands,
      pitchSnapSettings,
    );
  }

  const visuals = visualsRef.current;

  useEffect(() => {
    visuals.setLassoElement(globalLassoRef.current);

    return (): void => {
      visuals.setLassoElement(null);
    };
  }, [globalLassoRef, visuals]);

  useInteractionManager({
    overlayRef,
    strategyRef: interactionStrategyRef,
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
    strategyRef: interactionStrategyRef,
    viewport,
    spatialIndex,
    instrumentStyles,
    noteColorMode,
    projectStore,
    editorCommands,
    selection,
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
    onMarkerCollision,
    timeMapMarkerPreview,
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
      onContextMenu={(event) => {
        event.preventDefault();

        const pointerType = "pointerType" in event.nativeEvent
          ? event.nativeEvent.pointerType
          : "mouse";

        // Touch long presses draw notes, while pen alternative buttons are
        // handled at pointerdown. Neither should also open this menu.
        if (pointerType !== "mouse") {
          return;
        }

        onOpenContextMenu({ x: event.clientX, y: event.clientY });
      }}
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
    </div>
  );
}
