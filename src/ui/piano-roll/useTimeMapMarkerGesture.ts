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

export interface TimeMapMarkerGestureOptions {
  readonly flags: readonly TimeMapMarkerFlag[];
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly projectStore: ProjectStorePort;
  readonly layerRef: RefObject<HTMLDivElement | null>;
  readonly onOpenMarker: (tick: Tick) => void;
  readonly onMoveMarker: (fromTick: Tick, toTick: Tick) => void;
  readonly getFlagElement: (tick: Tick) => HTMLButtonElement | null;
  readonly getBoundaryElement: (tick: Tick) => HTMLElement | null;
  readonly resetPositions: () => void;
}

export interface TimeMapMarkerGestureController {
  readonly begin: (
    flag: TimeMapMarkerFlag,
    event: React.PointerEvent<HTMLElement>,
  ) => void;
}

export function useTimeMapMarkerGesture({
  flags,
  viewport,
  gridResolutionTicks,
  projectStore,
  layerRef,
  onOpenMarker,
  onMoveMarker,
  getFlagElement,
  getBoundaryElement,
  resetPositions,
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
      
      const finishClickOnly = (event: PointerEvent): void => {
        handle.removeEventListener("pointerup", finishClickOnly);
        const rect = handle.getBoundingClientRect();
        const inside = event.clientX >= rect.left && event.clientX <= rect.right
          && event.clientY >= rect.top && event.clientY <= rect.bottom;
        
        if (inside) {
          onOpenMarker(flag.startTick);
        }
      };

      handle.setPointerCapture(pointerId);
      handle.addEventListener("pointerup", finishClickOnly);
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
    const hasMeter = flag.timeSignature !== null;
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
      handle.classList.toggle("is-dragging", active);
      getBoundaryElement(originTick)?.classList.toggle("is-active", active);
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

    const applyDraftPosition = (tick: Tick): void => {
      const currentViewport = viewport.get();
      const x =
        tick * currentViewport.zoomX / currentViewport.ticksPerPixel
        - currentViewport.scrollX;
      
      const flagEl = getFlagElement(originTick);
      const boundaryEl = getBoundaryElement(originTick);

      if (flagEl !== null) {
        flagEl.style.transform = `translate3d(${String(x)}px, 0, 0)`;
      }

      if (boundaryEl !== null) {
        boundaryEl.style.transform = `translate3d(${String(x)}px, 0, 0)`;
      }
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

      applyDraftPosition(targetTick);
    };

    const finish = (event: PointerEvent): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
      setDraggingVisual(false);
      
      resetPositions();

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
            onOpenMarker(originTick);
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
      resetPositions();
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", cancel);
    handle.addEventListener("lostpointercapture", cancel);
  }, [
    flags,
    viewport,
    gridResolutionTicks,
    projectStore,
    layerRef,
    onOpenMarker,
    onMoveMarker,
    getFlagElement,
    getBoundaryElement,
    resetPositions,
  ]);

  return { begin };
}
