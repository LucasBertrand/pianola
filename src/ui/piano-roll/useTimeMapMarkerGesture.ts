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
    let lowerBound = 0;
    let upperBound = durationTicks;
    let measureBoundaryTicks: readonly number[] = [];

    if (hasMeter) {
      const meterTicks = timeMap.meterMarkers.map((marker) => marker.startTick);
      const markerIndex = meterTicks.indexOf(originTick);

      lowerBound = meterTicks[markerIndex - 1] ?? 0;
      upperBound = meterTicks[markerIndex + 1] ?? durationTicks;
      measureBoundaryTicks = getMeasureSpans(
        projectStore.getState().clock.ppqn,
        timeMap,
        durationTicks,
      ).map((span) => span.startTick);
    } else {
      const tempoTicks = timeMap.tempoMarkers.map((marker) => marker.startTick);
      const markerIndex = tempoTicks.indexOf(originTick);

      lowerBound = tempoTicks[markerIndex - 1] ?? 0;
      upperBound = tempoTicks[markerIndex + 1] ?? durationTicks;
    }

    let targetTick = originTick;
    let dragging = false;

    // React events are synthetic, we only capture pointer events for tracking drag
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
      const x = tick * currentViewport.zoomX / currentViewport.ticksPerPixel - currentViewport.scrollX;
      
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

      dragging = true;
      const rawTick = pointerTick(event.clientX);

      if (hasMeter) {
        targetTick = originTick;
        let nearestDistance = Number.POSITIVE_INFINITY;

        for (const boundaryTick of measureBoundaryTicks) {
          if (boundaryTick <= lowerBound || boundaryTick >= upperBound) {
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
        targetTick = Math.min(upperBound - 1, Math.max(lowerBound + 1, targetTick));
      }

      applyDraftPosition(targetTick);
    };

    const finish = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
      
      resetPositions();

      if (dragging && originTick !== targetTick) {
        onMoveMarker(originTick, targetTick);
      }
    };

    const cancel = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
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
