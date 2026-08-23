import React, {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from "react";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import {
  getClipDurationTicks,
} from "../../domain/clips/clip";
import type {
  LoopRegion,
} from "../../domain/transport/transport";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import type {
  ViewportState,
} from "../../editor/geometry/converter";
import {
  useCanvasRenderer,
  type CanvasFrame,
} from "./rendering/useCanvasRenderer";
import type {
  ReadonlyRenderSignal,
} from "../../editor/model/render-signal";
import type {
  PlayheadPosition,
} from "../../editor/model/playhead-position";
import type {
  ClipId,
} from "../../domain/identifiers";
import {
  paintRuler as paintRulerCanvas,
} from "./rendering/ruler-painter";
import {
  PianoRollLoopOverlay,
} from "./PianoRollLoopOverlay";
import {
  PianoRollTimeMapOverlay,
} from "./PianoRollTimeMapOverlay";
import type {
  TimeMapMarkerFlag,
} from "../../use-cases/piano-roll/timeline/time-map-marker-plans";
import type {
  EditorSelection,
} from "../../editor/selection/editor-selection";
import type {
  TimelineDragPreview,
} from "../../editor/model/timeline-drag-preview";
import type {
  MutableRenderSignal,
} from "../../editor/model/render-signal";
import type {
  PointerInteractionStrategy,
} from "../../editor/interactions/pointer/pointer-interaction-strategy";
import type {
  SelectionMode,
} from "../../editor/interactions/gestures/gesture-draft";

export interface PianoRollRulerProps {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly projectStore: ProjectStorePort;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly markerFlags: readonly TimeMapMarkerFlag[];
  readonly selection: EditorSelection;
  readonly timelineDragPreview: MutableRenderSignal<
    TimelineDragPreview | null
  >;
  readonly loopDragPreview: MutableRenderSignal<LoopRegion | null>;
  readonly interactionStrategyRef: RefObject<
    PointerInteractionStrategy | null
  >;
  readonly selectionMode: SelectionMode;
  readonly onLoopCommit: (loop: LoopRegion) => void;
  readonly onOpenMarker: (tick: number) => void;
  readonly onSelectMarker: (tick: number, mode: SelectionMode) => void;
  readonly onMoveMarker: (fromTick: number, toTick: number) => void;
  readonly onClearSelection: () => void;
}

export function PianoRollRuler(
  props: PianoRollRulerProps,
): React.JSX.Element {
  const {
    viewport,
    projectStore,
    gridResolutionTicks,
    markerFlags,
    selection,
    timelineDragPreview,
    loopDragPreview,
    interactionStrategyRef,
    selectionMode,
    onLoopCommit,
    onOpenMarker,
    onSelectMarker,
    onMoveMarker,
    onClearSelection,
  } = props;
  const renderRuler = useCallback(
    (frame: CanvasFrame): void => {
      const currentViewport = viewport.get();
      const projectState = projectStore.getState();
      const activeClip = getActiveClip(projectState);
      const totalTicks = getClipDurationTicks(activeClip);
      paintRulerCanvas({
        context: frame.context,
        widthCssPixels: frame.widthCssPixels,
        heightCssPixels: frame.heightCssPixels,
        devicePixelRatio: frame.devicePixelRatio,
        viewport: currentViewport,
        clock: projectState.clock,
        timeMap: activeClip.timeline.timeMap,
        durationTicks: totalTicks,
        gridResolutionTicks: gridResolutionTicks.get(),
      });
    },
    [
      gridResolutionTicks,
      projectStore,
      viewport,
    ],
  );
  const renderer = useCanvasRenderer({
    render: renderRuler,
    mode: "on-demand",
    clearBeforeRender: true,
  });

  useEffect(() => {
    const unsubscribeViewport = viewport.subscribe(
      renderer.invalidate,
    );
    const unsubscribeGrid = gridResolutionTicks.subscribe(
      renderer.invalidate,
    );
    const unsubscribeProject = projectStore.subscribe(
      renderer.invalidate,
    );

    renderer.invalidate();

    return (): void => {
      unsubscribeViewport();
      unsubscribeGrid();
      unsubscribeProject();
    };
  }, [
    gridResolutionTicks,
    projectStore,
    renderer.invalidate,
    viewport,
  ]);

  return (
    <div className="bar-ruler">
      <canvas
        ref={renderer.canvasRef}
        className="bar-ruler-canvas"
        aria-label="Timeline ruler"
      />
      <PianoRollLoopOverlay
        viewport={viewport}
        projectStore={projectStore}
        gridResolutionTicks={gridResolutionTicks}
        interactionStrategyRef={interactionStrategyRef}
        loopDragPreview={loopDragPreview}
        onCommit={onLoopCommit}
        onClearSelection={onClearSelection}
      />
      <PianoRollTimeMapOverlay
        flags={markerFlags}
        selection={selection}
        timelineDragPreview={timelineDragPreview}
        viewport={viewport}
        projectStore={projectStore}
        gridResolutionTicks={gridResolutionTicks}
        selectionMode={selectionMode}
        onOpenMarker={onOpenMarker}
        onSelectMarker={onSelectMarker}
        onMoveMarker={onMoveMarker}
      />
    </div>
  );
}

export interface PianoRollPlayheadProps {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly clipId: ClipId;
  readonly playheadPosition: ReadonlyRenderSignal<PlayheadPosition>;
}

export function PianoRollPlayhead(
  props: PianoRollPlayheadProps,
): React.JSX.Element {
  const {
    viewport,
    clipId,
    playheadPosition,
  } = props;
  const elementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updatePosition = (): void => {
      const element = elementRef.current;

      if (element === null) {
        return;
      }

      const position = playheadPosition.get();

      if (position.clipId !== clipId) {
        element.hidden = true;
        return;
      }

      element.hidden = false;
      const currentViewport = viewport.get();
      const x =
        position.tick
        * currentViewport.zoomX
        / currentViewport.ticksPerPixel
        - currentViewport.scrollX;

      element.style.transform = `translate3d(${x}px, 0, 0)`;
    };
    const unsubscribeViewport = viewport.subscribe(updatePosition);
    const unsubscribePlayhead = playheadPosition.subscribe(updatePosition);

    updatePosition();

    return (): void => {
      unsubscribeViewport();
      unsubscribePlayhead();
    };
  }, [
    clipId,
    playheadPosition,
    viewport,
  ]);

  return (
    <div
      ref={elementRef}
      className="roll-playhead"
      aria-hidden="true"
    />
  );
}
