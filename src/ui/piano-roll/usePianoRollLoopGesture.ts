import {
  useEffect,
  type RefObject,
} from "react";
import {
  INTERACTION_CONSTANTS,
} from "../../config/interaction-config";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import {
  getClipDurationTicks,
} from "../../domain/clips/clip";
import {
  snapTickToMeasureGrid,
} from "../../domain/transport/time-map";
import type {
  LoopRegion,
} from "../../domain/transport/transport";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import type {
  ViewportState,
} from "../../editor/geometry/converter";
import type {
  PointerInteractionStrategy,
} from "../../editor/interactions/pointer/pointer-interaction-strategy";

import type {
  MutableRenderSignal,
  ReadonlyRenderSignal,
} from "../../editor/model/render-signal";
import {
  createPointerSample,
} from "./interactions/dom-pointer-sample";

type LoopGestureMode =
  | "move"
  | "pending-layer"
  | "draw"
  | "set-start"
  | "set-end"
  | "resize-start"
  | "resize-end";

export interface PianoRollLoopGestureOptions {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly projectStore: ProjectStorePort;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly interactionStrategyRef: RefObject<
    PointerInteractionStrategy | null
  >;
  readonly loopDragPreview: MutableRenderSignal<LoopRegion | null>;
  readonly onCommit: (loop: LoopRegion) => void;
  readonly onClearSelection: () => void;
  readonly layerRef: RefObject<HTMLDivElement | null>;
  readonly bandRef: RefObject<HTMLButtonElement | null>;
  readonly startFlagRef: RefObject<HTMLButtonElement | null>;
  readonly endFlagRef: RefObject<HTMLButtonElement | null>;
  readonly boundaryLayerRef: RefObject<HTMLDivElement | null>;
  readonly startBoundaryRef: RefObject<HTMLElement | null>;
  readonly endBoundaryRef: RefObject<HTMLElement | null>;
}

/** Binds the complete loop move/draw/resize pointer protocol. */
export function usePianoRollLoopGesture({
  viewport,
  projectStore,
  gridResolutionTicks,
  interactionStrategyRef,
  loopDragPreview,
  onCommit,
  onClearSelection,
  layerRef,
  bandRef,
  startFlagRef,
  endFlagRef,
  boundaryLayerRef,
  startBoundaryRef,
  endBoundaryRef,
}: PianoRollLoopGestureOptions): void {  useEffect(() => {
    const layer = layerRef.current;
    const band = bandRef.current;
    const startFlag = startFlagRef.current;
    const endFlag = endFlagRef.current;
    const boundaryLayer = boundaryLayerRef.current;
    const startBoundary = startBoundaryRef.current;
    const endBoundary = endBoundaryRef.current;

    if (
      layer === null
      || band === null
      || startFlag === null
      || endFlag === null
      || boundaryLayer === null
      || startBoundary === null
      || endBoundary === null
    ) {
      return undefined;
    }

    let activePointerId = -1;
    let gestureMode: LoopGestureMode | null = null;
    let originClientX = 0;
    let originClientY = 0;
    let originStartTick = 0;
    let originEndTick = 0;
    let draftStartTick = 0;
    let draftEndTick = 0;
    let snapResolutionTicks = 1;
    let snapFn: (tick: number) => number = (tick) => tick;
    let projectDurationTicks = 1;
    let layerLeft = 0;
    let drawAnchorTick = 0;
    let layerLongPressTimerId: number | null = null;
    let previewStartTick: number | null = null;
    let previewEndTick: number | null = null;

    const publishPreview = (startTick: number, endTick: number): void => {
      if (
        startTick === previewStartTick
        && endTick === previewEndTick
      ) {
        return;
      }

      previewStartTick = startTick;
      previewEndTick = endTick;
      loopDragPreview.set({ startTick, endTick });
    };
    const clearPreview = (): void => {
      previewStartTick = null;
      previewEndTick = null;
      loopDragPreview.set(null);
    };

    const cancelLayerLongPress = (): void => {
      if (layerLongPressTimerId !== null) {
        window.clearTimeout(layerLongPressTimerId);
        layerLongPressTimerId = null;
      }
    };

    const updateElements = (
      startTick: number,
      endTick: number,
      enabled: boolean,
    ): void => {
      const currentViewport = viewport.get();
      const pixelsPerTick =
        currentViewport.zoomX / currentViewport.ticksPerPixel;
      const startX =
        startTick * pixelsPerTick - currentViewport.scrollX;
      const endX =
        endTick * pixelsPerTick - currentViewport.scrollX;

      band.style.transform =
        `translate3d(${startX}px, 0, 0)`;
      band.style.width = `${Math.max(1, endX - startX)}px`;
      startFlag.style.transform =
        `translate3d(${startX - 11}px, 0, 0)`;
      endFlag.style.transform =
        `translate3d(${endX - 11}px, 0, 0)`;
      startBoundary.style.transform =
        `translate3d(${startX}px, 0, 0)`;
      endBoundary.style.transform =
        `translate3d(${endX}px, 0, 0)`;
      startBoundary.style.display = "block";
      endBoundary.style.display = "block";
      layer.dataset["enabled"] = String(enabled);
      boundaryLayer.dataset["enabled"] = String(enabled);
    };
    const updateFromState = (): void => {
      if (activePointerId !== -1) {
        return;
      }

      const transport = getActiveClip(
        projectStore.getState(),
      ).transportSettings;

      updateElements(
        transport.loop.startTick,
        transport.loop.endTick,
        transport.loopEnabled,
      );
    };
    const updateDraft = (clientX: number): void => {
      if (gestureMode === null) {
        return;
      }

      const currentViewport = viewport.get();
      const rawDeltaTicks =
        (clientX - originClientX)
        * currentViewport.ticksPerPixel
        / currentViewport.zoomX;
      const minimumDurationTicks = Math.min(
        snapResolutionTicks,
        Math.max(1, originEndTick - originStartTick),
      );
      const pointerHasMoved = clientX !== originClientX;

      if (gestureMode === "pending-layer") {
        return;
      }

      if (gestureMode === "draw") {
        const absolutePointerTick =
          (
            currentViewport.scrollX
            + clientX
            - layerLeft
          )
          * currentViewport.ticksPerPixel
          / currentViewport.zoomX;
        const snappedPointerTick = snapFn(absolutePointerTick);
        const boundedPointerTick = Math.min(
          projectDurationTicks,
          Math.max(0, snappedPointerTick),
        );
        const drawMinimumDurationTicks = Math.min(
          snapResolutionTicks,
          projectDurationTicks,
        );

        if (boundedPointerTick < drawAnchorTick) {
          draftStartTick = boundedPointerTick;
          draftEndTick = Math.max(
            drawAnchorTick,
            boundedPointerTick + drawMinimumDurationTicks,
          );
        } else {
          draftStartTick = drawAnchorTick;
          draftEndTick = Math.min(
            projectDurationTicks,
            Math.max(
              drawAnchorTick + drawMinimumDurationTicks,
              boundedPointerTick,
            ),
          );
        }
      } else if (gestureMode === "set-start") {
        const absolutePointerTick =
          (
            currentViewport.scrollX
            + clientX
            - layerLeft
          )
          * currentViewport.ticksPerPixel
          / currentViewport.zoomX;
        const snappedStartTick = snapFn(absolutePointerTick);
        const maximumStartTick = Math.max(
          0,
          originEndTick - minimumDurationTicks,
        );

        draftStartTick = Math.min(
          maximumStartTick,
          Math.max(0, snappedStartTick),
        );
        draftEndTick = originEndTick;
      } else if (gestureMode === "set-end") {
        const absolutePointerTick =
          (
            currentViewport.scrollX
            + clientX
            - layerLeft
          )
          * currentViewport.ticksPerPixel
          / currentViewport.zoomX;
        const snappedEndTick = snapFn(absolutePointerTick);

        draftStartTick = originStartTick;
        draftEndTick = Math.max(
          originStartTick + minimumDurationTicks,
          Math.min(projectDurationTicks, snappedEndTick),
        );
      } else if (gestureMode === "resize-start") {
        const snappedStartTick = pointerHasMoved
          ? snapFn(originStartTick + rawDeltaTicks)
          : originStartTick;

        draftStartTick = Math.min(
          originEndTick - minimumDurationTicks,
          Math.max(0, snappedStartTick),
        );
        draftEndTick = originEndTick;
      } else if (gestureMode === "resize-end") {
        const snappedEndTick = pointerHasMoved
          ? snapFn(originEndTick + rawDeltaTicks)
          : originEndTick;

        draftStartTick = originStartTick;
        draftEndTick = Math.max(
          originStartTick + minimumDurationTicks,
          Math.min(
            projectDurationTicks,
            snappedEndTick,
          ),
        );
      } else {
        const durationTicks =
          originEndTick - originStartTick;
        const snappedStartTick = pointerHasMoved
          ? snapFn(originStartTick + rawDeltaTicks)
          : originStartTick;
        const movedStartTick = Math.min(
          projectDurationTicks - durationTicks,
          Math.max(0, snappedStartTick),
        );

        draftStartTick = movedStartTick;
        draftEndTick = movedStartTick + durationTicks;
      }

      updateElements(
        draftStartTick,
        draftEndTick,
        getActiveClip(
          projectStore.getState(),
        ).transportSettings.loopEnabled,
      );
      publishPreview(draftStartTick, draftEndTick);
    };
    const scheduleLayerLongPress = (event: PointerEvent): void => {
      cancelLayerLongPress();
      const pointerId = event.pointerId;
      const delay = event.pointerType === "pen"
        ? INTERACTION_CONSTANTS.loopDrawPenLongPressDelayMs
        : INTERACTION_CONSTANTS.loopDrawLongPressDelayMs;

      layerLongPressTimerId = window.setTimeout(() => {
        layerLongPressTimerId = null;

        if (
          activePointerId !== pointerId
          || gestureMode !== "pending-layer"
        ) {
          return;
        }

        interactionStrategyRef.current?.cancel();
        gestureMode = "draw";
        onClearSelection();
        updateDraft(originClientX);
      }, delay);
    };
    const handlePointerDown = (event: PointerEvent): void => {
      if (
        event.button !== 0
        || activePointerId !== -1
      ) {
        return;
      }

      const gestureTarget =
        (event.target as Element).closest<HTMLElement>(
          "[data-loop-mode]",
        );
      const requestedMode =
        gestureTarget?.dataset["loopMode"];
      const layerBounds = layer.getBoundingClientRect();
      const resolvedMode =
        requestedMode === undefined
        && event.target === layer
          ? "pending-layer"
          : requestedMode;

      if (
        resolvedMode !== "move"
        && resolvedMode !== "pending-layer"
        && resolvedMode !== "draw"
        && resolvedMode !== "set-start"
        && resolvedMode !== "set-end"
        && resolvedMode !== "resize-start"
        && resolvedMode !== "resize-end"
      ) {
        return;
      }

      if (resolvedMode !== "pending-layer") {
        onClearSelection();
      }
      const state = projectStore.getState();
      const clip = getActiveClip(state);
      const loop = clip.transportSettings.loop;
      const currentViewport = viewport.get();
      const absolutePointerTick =
        (
          currentViewport.scrollX
          + event.clientX
          - layerBounds.left
        )
        * currentViewport.ticksPerPixel
        / currentViewport.zoomX;

      activePointerId = event.pointerId;
      gestureMode = resolvedMode;
      originClientX = event.clientX;
      originClientY = event.clientY;
      originStartTick = loop.startTick;
      originEndTick = loop.endTick;
      draftStartTick = loop.startTick;
      draftEndTick = loop.endTick;
      snapResolutionTicks = Math.max(
        1,
        gridResolutionTicks.get(),
      );
      projectDurationTicks = getClipDurationTicks(clip);
      const snapRes = snapResolutionTicks;
      snapFn = (tick) =>
        snapTickToMeasureGrid(
          state.clock.ppqn,
          clip.timeline.timeMap,
          clip.timeline.durationTicks,
          tick,
          snapRes,
        );
      layerLeft = layerBounds.left;
      const drawMinimumDurationTicks = Math.min(
        snapResolutionTicks,
        projectDurationTicks,
      );
      drawAnchorTick = Math.min(
        Math.max(
          0,
          projectDurationTicks - drawMinimumDurationTicks,
        ),
        Math.max(
          0,
          snapFn(absolutePointerTick),
        ),
      );
      layer.setPointerCapture(event.pointerId);
      if (resolvedMode === "pending-layer") {
        interactionStrategyRef.current?.onPointerDown(
          createPointerSample(event),
        );
        scheduleLayerLongPress(event);
      } else if (
        resolvedMode === "set-start"
        || resolvedMode === "set-end"
      ) {
        updateDraft(event.clientX);
      }

      event.preventDefault();
    };
    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== activePointerId) {
        return;
      }

      if (gestureMode === "pending-layer") {
        if (
          Math.abs(event.clientX - originClientX)
            > INTERACTION_CONSTANTS.tapMovementToleranceCssPixels
          || Math.abs(event.clientY - originClientY)
            > INTERACTION_CONSTANTS.tapMovementToleranceCssPixels
        ) {
          cancelLayerLongPress();
        }

        interactionStrategyRef.current?.onPointerMove(
          createPointerSample(event),
        );
        event.preventDefault();
        return;
      }

      updateDraft(event.clientX);
      event.preventDefault();
    };
    const finishPointer = (event: PointerEvent): void => {
      if (event.pointerId !== activePointerId) {
        return;
      }

      cancelLayerLongPress();

      if (gestureMode === "pending-layer") {
        interactionStrategyRef.current?.onPointerUp(
          createPointerSample(event),
        );
        activePointerId = -1;
        gestureMode = null;
        clearPreview();

        if (layer.hasPointerCapture(event.pointerId)) {
          layer.releasePointerCapture(event.pointerId);
        }

        updateFromState();
        event.preventDefault();
        return;
      }

      updateDraft(event.clientX);
      const nextStartTick = draftStartTick;
      const nextEndTick = draftEndTick;
      const changed =
        nextStartTick !== originStartTick
        || nextEndTick !== originEndTick;

      activePointerId = -1;
      gestureMode = null;

      if (layer.hasPointerCapture(event.pointerId)) {
        layer.releasePointerCapture(event.pointerId);
      }

      if (changed) {
        onCommit({
          startTick: nextStartTick,
          endTick: nextEndTick,
        });
      } else {
        updateFromState();
      }
      clearPreview();

      event.preventDefault();
    };
    const cancelPointer = (event: PointerEvent): void => {
      if (event.pointerId !== activePointerId) {
        return;
      }

      cancelLayerLongPress();

      if (gestureMode === "pending-layer") {
        interactionStrategyRef.current?.onPointerCancel(
          createPointerSample(event),
        );
      }

      activePointerId = -1;
      gestureMode = null;
      clearPreview();
      updateFromState();
    };
    const handleContextMenu = (event: MouseEvent): void => {
      event.preventDefault();
    };
    const unsubscribeViewport =
      viewport.subscribe(updateFromState);
    const unsubscribeProject =
      projectStore.subscribe(updateFromState);

    layer.addEventListener("pointerdown", handlePointerDown);
    layer.addEventListener("pointermove", handlePointerMove);
    layer.addEventListener("pointerup", finishPointer);
    layer.addEventListener("pointercancel", cancelPointer);
    layer.addEventListener("contextmenu", handleContextMenu);
    layer.addEventListener(
      "lostpointercapture",
      cancelPointer,
    );
    updateFromState();

    return (): void => {
      cancelLayerLongPress();
      clearPreview();
      if (gestureMode === "pending-layer") {
        interactionStrategyRef.current?.cancel();
      }
      unsubscribeViewport();
      unsubscribeProject();
      layer.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
      layer.removeEventListener(
        "pointermove",
        handlePointerMove,
      );
      layer.removeEventListener("pointerup", finishPointer);
      layer.removeEventListener(
        "pointercancel",
        cancelPointer,
      );
      layer.removeEventListener("contextmenu", handleContextMenu);
      layer.removeEventListener(
        "lostpointercapture",
        cancelPointer,
      );
    };
  }, [
    gridResolutionTicks,
    interactionStrategyRef,
    loopDragPreview,
    onCommit,
    onClearSelection,
    projectStore,
    viewport,
  ]);
}
