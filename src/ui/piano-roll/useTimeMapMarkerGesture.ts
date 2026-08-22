import {
  useCallback,
  type RefObject,
} from "react";
import {
  INTERACTION_CONSTANTS,
} from "../../config/interaction-config";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import type {
  Tick,
} from "../../domain/identifiers";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import {
  getMeasureSpans,
  snapTickToMeasureGrid,
} from "../../domain/transport/time-map";
import type {
  ViewportState,
} from "../../editor/geometry/converter";
import type {
  ReadonlyRenderSignal,
} from "../../editor/model/render-signal";
import type {
  TimeMapMarkerFlag,
} from "../../use-cases/piano-roll/timeline/time-map-marker-plans";
import type {
  EditorSelection,
} from "../../editor/selection/editor-selection";
import {
  clampTimelineSelectionDelta,
} from "../../use-cases/piano-roll/selection/timeline-selection-move";
import type {
  TimelineDragPreview,
} from "../../editor/model/timeline-drag-preview";
import type {
  MutableRenderSignal,
} from "../../editor/model/render-signal";

export interface TimeMapMarkerGestureOptions {
  readonly selection: EditorSelection;
  readonly timelineDragPreview: MutableRenderSignal<
    TimelineDragPreview | null
  >;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly projectStore: ProjectStorePort;
  readonly layerRef: RefObject<HTMLDivElement | null>;
  readonly onSelectMarker: (tick: Tick) => void;
  readonly onMoveMarker: (fromTick: Tick, toTick: Tick) => void;
  readonly getFlagElement: (tick: Tick) => HTMLButtonElement | null;
}

export interface TimeMapMarkerGestureController {
  readonly begin: (
    flag: TimeMapMarkerFlag,
    event: React.PointerEvent<HTMLElement>,
  ) => void;
}

export function useTimeMapMarkerGesture({
  selection,
  timelineDragPreview,
  viewport,
  gridResolutionTicks,
  projectStore,
  layerRef,
  onSelectMarker,
  onMoveMarker,
  getFlagElement,
}: TimeMapMarkerGestureOptions): TimeMapMarkerGestureController {
  const begin = useCallback((
    flag: TimeMapMarkerFlag,
    reactEvent: React.PointerEvent<HTMLElement>,
  ) => {
    if (reactEvent.button !== 0 || !reactEvent.isPrimary) {
      return;
    }

    if (flag.isInitial) {
      const handle = reactEvent.currentTarget;
      const pointerId = reactEvent.pointerId;

      function cleanupClickOnly(): void {
        handle.removeEventListener("pointerup", finishClickOnly);
        handle.removeEventListener("pointercancel", cancelClickOnly);
        handle.removeEventListener("lostpointercapture", cancelClickOnly);
      }

      function finishClickOnly(event: PointerEvent): void {
        cleanupClickOnly();
        const rect = handle.getBoundingClientRect();
        const inside = event.clientX >= rect.left && event.clientX <= rect.right
          && event.clientY >= rect.top && event.clientY <= rect.bottom;

        if (inside) {
          onSelectMarker(flag.startTick);
        }
      }

      function cancelClickOnly(): void {
        cleanupClickOnly();
      }

      handle.setPointerCapture(pointerId);
      handle.addEventListener("pointerup", finishClickOnly);
      handle.addEventListener("pointercancel", cancelClickOnly);
      handle.addEventListener("lostpointercapture", cancelClickOnly);
      return;
    }

    const handle = reactEvent.currentTarget;
    const layer = layerRef.current;
    
    if (layer === null) {
      return;
    }

    const pointerId = reactEvent.pointerId;
    const originClientX = reactEvent.clientX;
    const originClientY = reactEvent.clientY;
    const originTick = flag.startTick;
    const movesSelection = selection.hasMarkerGroup(originTick);
    const hasMeter = !movesSelection && flag.timeSignature !== null;
    const splitsMeterFlag =
      movesSelection
      && flag.timeSignature !== null
      && (flag.bpm !== null || flag.patternId !== null);
    const layerLeft = layer.getBoundingClientRect().left;

    const clip = getActiveClip(projectStore.getState());
    const { timeMap, durationTicks } = clip.timeline;
    let measureBoundaryTicks: readonly number[] = [];

    if (hasMeter) {
      measureBoundaryTicks = getMeasureSpans(
        projectStore.getState().clock.ppqn,
        timeMap,
        durationTicks,
      ).map((span) => span.startTick);
    }

    let targetTick = originTick;
    let dragging = false;

    const setDraggingVisual = (active: boolean): void => {
      handle.classList.toggle("is-dragging", active && !splitsMeterFlag);
    };

    handle.setPointerCapture(pointerId);

    const pointerTick = (clientX: number): number => {
      const currentViewport = viewport.get();
      return (
        (currentViewport.scrollX + clientX - layerLeft)
        * currentViewport.ticksPerPixel
        / currentViewport.zoomX
      );
    };

    const move = (event: PointerEvent): void => {
      if (
        !dragging
        && Math.abs(event.clientX - originClientX) < INTERACTION_CONSTANTS.tapMovementToleranceCssPixels
        && Math.abs(event.clientY - originClientY) < INTERACTION_CONSTANTS.tapMovementToleranceCssPixels
      ) {
        return;
      }

      if (!dragging) {
        dragging = true;
        setDraggingVisual(true);
      }

      const rawTick = pointerTick(event.clientX);

      if (hasMeter) {
        targetTick = originTick;
        let nearestDistance = Number.POSITIVE_INFINITY;

        for (const boundaryTick of measureBoundaryTicks) {
          if (boundaryTick === 0) {
            continue;
          }

          const distance = Math.abs(boundaryTick - rawTick);

          if (distance < nearestDistance) {
            nearestDistance = distance;
            targetTick = boundaryTick;
          }
        }
      } else {
        const resolution = Math.max(1, gridResolutionTicks.get());
        const state = projectStore.getState();

        targetTick = snapTickToMeasureGrid(
          state.clock.ppqn,
          timeMap,
          durationTicks,
          rawTick,
          resolution,
        );
        targetTick = Math.min(durationTicks, Math.max(0, targetTick));
      }

      if (movesSelection) {
        targetTick = originTick + clampTimelineSelectionDelta(
          selection.notes,
          selection.markerGroups,
          targetTick - originTick,
          durationTicks,
        );
      }

      timelineDragPreview.set({
        source: "markers",
        deltaTicks: targetTick - originTick,
        standaloneMarkerTick: movesSelection ? null : originTick,
      });
    };

    const finish = (event: PointerEvent): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
      setDraggingVisual(false);
      timelineDragPreview.set(null);

      if (dragging) {
        if (originTick !== targetTick) {
          onMoveMarker(originTick, targetTick);
        }
      } else {
        const flagElement = getFlagElement(originTick);
        if (flagElement !== null) {
          const rect = flagElement.getBoundingClientRect();
          const inside = event.clientX >= rect.left && event.clientX <= rect.right
            && event.clientY >= rect.top && event.clientY <= rect.bottom;
          
          if (inside) {
            onSelectMarker(originTick);
          }
        }
      }
    };

    const cancel = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
      setDraggingVisual(false);
      timelineDragPreview.set(null);
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", cancel);
    handle.addEventListener("lostpointercapture", cancel);
  }, [
    viewport,
    gridResolutionTicks,
    projectStore,
    layerRef,
    onSelectMarker,
    onMoveMarker,
    getFlagElement,
    selection,
    timelineDragPreview,
  ]);

  return { begin };
}
