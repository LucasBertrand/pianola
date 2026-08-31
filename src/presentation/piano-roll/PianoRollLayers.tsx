import React, {
  useRef,
  type CSSProperties,
  type MutableRefObject,
  type RefObject,
} from "react";
import {
  type InstrumentId,
} from "../../domain/identifiers";
import type {
  NoteCollisionResolutionRequest,
} from "../../application/piano-roll/notes/note-collision-resolution";
import type {
  MarkerCollisionResolutionRequest,
} from "../../application/piano-roll/timeline/marker-collision-resolution";
import type {
  ViewportState,
} from "../../editor-core/geometry/converter";
import {
  EditingNoteMask,
} from "../../editor-core/interactions/editing-note-mask";
import type {
  PianoRollControllerPort,
} from "../../editor-core/interactions/piano-roll-controller-port";
import type {
  PointerInteractionStrategy,
} from "../../editor-core/interactions/pointer/pointer-interaction-strategy";
import type {
  SelectionMode,
} from "../../editor-core/interactions/gestures/gesture-draft";
import type {
  PianoRollRuntimePort,
} from "./piano-roll-runtime-port";
import {
  GridCanvas,
  NotesCanvas,
} from "./rendering/CanvasLayer";
import {
  InteractionOverlay,
} from "./InteractionOverlay";

export interface PianoRollLayersProps {
  readonly runtime: PianoRollRuntimePort;
  readonly selectionMode: SelectionMode;
  readonly activeInstrumentId: InstrumentId;
  readonly totalTicks: number;
  readonly setViewport: (viewport: ViewportState) => void;
  readonly onHorizontalViewportInteractionStart: () => void;
  readonly onHorizontalViewportInteractionEnd: () => void;
  readonly onTwoFingerDoubleTap: () => void;
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
  readonly onNoteCollision: (
    request: NoteCollisionResolutionRequest,
  ) => void;
  readonly onMarkerCollision: (
    request: MarkerCollisionResolutionRequest,
  ) => void;
  readonly globalLassoRef: RefObject<HTMLDivElement | null>;
}

const LAYER_STACK_STYLE: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  isolation: "isolate",
};

export function PianoRollLayers(
  props: PianoRollLayersProps,
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
    controllerRef,
    interactionStrategyRef,
    onSelectionChange,
    onGridSeek,
    onNoteCollision,
    onMarkerCollision,
    globalLassoRef,
  } = props;
  const {
    viewport,
    visibleRegion,
    spatialIndex,
    instrumentStyles,
    noteColorMode,
    projectStore,
    gridResolutionTicks,
    pitchSnapSettings,
    highlightedPitch,
  } = runtime;
  const editingNoteMaskRef = useRef<EditingNoteMask | null>(null);

  if (editingNoteMaskRef.current === null) {
    editingNoteMaskRef.current = new EditingNoteMask();
  }

  const editingNoteMask = editingNoteMaskRef.current;

  return (
    <div style={LAYER_STACK_STYLE}>
      <GridCanvas
        viewport={viewport}
        visibleRegion={visibleRegion}
        gridResolutionTicks={gridResolutionTicks}
        pitchSnapSettings={pitchSnapSettings}
        highlightedPitch={highlightedPitch}
        projectStore={projectStore}
        markerPreview={runtime.timeMapMarkerPreview.signal}
      />
      <NotesCanvas
        viewport={viewport}
        visibleRegion={visibleRegion}
        spatialIndex={spatialIndex}
        projectStore={projectStore}
        instrumentStyles={instrumentStyles}
        noteColorMode={noteColorMode}
        pitchSnapSettings={pitchSnapSettings}
        editingNoteMask={editingNoteMask}
        markerPreview={runtime.timeMapMarkerPreview.signal}
      />
      <InteractionOverlay
        runtime={runtime}
        selectionMode={selectionMode}
        activeInstrumentId={activeInstrumentId}
        totalTicks={totalTicks}
        setViewport={setViewport}
        onHorizontalViewportInteractionStart={
          onHorizontalViewportInteractionStart
        }
        onHorizontalViewportInteractionEnd={
          onHorizontalViewportInteractionEnd
        }
        onTwoFingerDoubleTap={onTwoFingerDoubleTap}
        editingNoteMask={editingNoteMask}
        controllerRef={controllerRef}
        interactionStrategyRef={interactionStrategyRef}
        onSelectionChange={onSelectionChange}
        onGridSeek={onGridSeek}
        onNoteCollision={onNoteCollision}
        onMarkerCollision={onMarkerCollision}
        globalLassoRef={globalLassoRef}
      />
    </div>
  );
}
