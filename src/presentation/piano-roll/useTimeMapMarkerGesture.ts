import {
  useCallback,
  type RefObject,
} from "react";
import {
  INTERACTION_CONSTANTS,
} from "../../editor-core/interactions/interaction-constants";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import type {
  Tick,
} from "../../domain/identifiers";
import type {
  ProjectStorePort,
} from "../../application/history/project-store";
import {
  snapTickToMeasureGrid,
} from "../../domain/transport/time-map";
import type {
  ViewportState,
} from "../../editor-core/geometry/converter";
import type {
  ReadonlyRenderSignal,
} from "../../editor-core/model/render-signal";
import type {
  TimeMapMarkerFlag,
} from "../../application/piano-roll/timeline/time-map-marker-plans";
import type {
  EditorSelection,
} from "../../editor-core/selection/editor-selection";
import {
  createSelectedMarkerGroup,
} from "../../editor-core/selection/editor-selection";
import {
  clampTimelineSelectionDelta,
} from "../../application/piano-roll/selection/timeline-selection-move";
import type {
  SelectionMode,
} from "../../editor-core/interactions/gestures/gesture-draft";
import type {
  TimeMapMarkerPreviewSession,
  TimeMapMarkerPreviewToken,
} from "../../application/editor-session/time-map-marker-preview-session";
import {
  BoundedPointerTickPosition,
} from "../../editor-core/interactions/gestures/bounded-pointer-tick-position";

export interface TimeMapMarkerGestureOptions {
  readonly selection: EditorSelection;
  readonly markerPreview: TimeMapMarkerPreviewSession;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly projectStore: ProjectStorePort;
  readonly layerRef: RefObject<HTMLDivElement | null>;
  readonly selectionMode: SelectionMode;
  readonly onSelectMarker: (tick: Tick, mode: SelectionMode) => void;
  readonly onMoveMarker: (fromTick: Tick, toTick: Tick) => void;
  /** Prevents the browser's post-drag click from activating the source flag. */
  readonly onSuppressActivation: (tick: Tick) => void;
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
  markerPreview,
  viewport,
  gridResolutionTicks,
  projectStore,
  layerRef,
  selectionMode,
  onSelectMarker,
  onMoveMarker,
  onSuppressActivation,
  getFlagElement,
}: TimeMapMarkerGestureOptions): TimeMapMarkerGestureController {
  const begin = useCallback((
    flag: TimeMapMarkerFlag,
    reactEvent: React.PointerEvent<HTMLElement>,
  ) => {
    if (reactEvent.button !== 0 || !reactEvent.isPrimary) {
      return;
    }

    const effectiveSelectionMode = reactEvent.shiftKey
      ? "add"
      : selectionMode;

    if (flag.isInitial && flag.sectionComment === null) {
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
          onSelectMarker(flag.startTick, effectiveSelectionMode);
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
    const standaloneGroup = createSelectedMarkerGroup(
      originTick,
      flag.bpm !== null,
      flag.patternId !== null,
      flag.sectionComment !== null,
    );
    const movedGroups = movesSelection
      ? selection.markerGroups
      : standaloneGroup === null ? [] : [standaloneGroup];
    const layerLeft = layer.getBoundingClientRect().left;

    const clip = getActiveClip(projectStore.getState());
    const { timeMap, durationTicks } = clip.timeline;
    let targetTick = originTick;
    let dragging = false;
    let previewToken: TimeMapMarkerPreviewToken | null = null;
    const dragPosition = new BoundedPointerTickPosition(
      originTick,
      (deltaTicks) => movesSelection
        ? clampTimelineSelectionDelta(
            selection.notes,
            selection.markerGroups,
            deltaTicks,
            durationTicks,
          )
        : Math.min(
            durationTicks - originTick,
            Math.max(-originTick, deltaTicks),
          ),
    );

    const setDraggingVisual = (active: boolean): void => {
      handle.classList.toggle("is-dragging", active);
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
        previewToken = markerPreview.begin({
          clipId: clip.id,
          movedGroups,
        });
      }

      const rawTick = pointerTick(event.clientX);

      const resolution = Math.max(1, gridResolutionTicks.get());
      const state = projectStore.getState();

      targetTick = dragPosition.resolve(
        rawTick,
        (tick) => snapTickToMeasureGrid(
          state.clock.ppqn,
          timeMap,
          durationTicks,
          tick,
          resolution,
        ),
      );

      if (previewToken !== null) {
        markerPreview.update(previewToken, targetTick - originTick);
      }
    };

    const finish = (event: PointerEvent): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
      setDraggingVisual(false);

      if (dragging) {
        onSuppressActivation(originTick);
        if (
          originTick !== targetTick
          && previewToken !== null
          && markerPreview.isActive(previewToken)
        ) {
          onMoveMarker(originTick, targetTick);
        }
      } else {
        const flagElement = getFlagElement(originTick);
        if (flagElement !== null) {
          const rect = flagElement.getBoundingClientRect();
          const inside = event.clientX >= rect.left && event.clientX <= rect.right
            && event.clientY >= rect.top && event.clientY <= rect.bottom;
          
          if (inside) {
            onSelectMarker(originTick, effectiveSelectionMode);
          }
        }
      }

      if (previewToken !== null) {
        markerPreview.clear(previewToken);
        previewToken = null;
      }
    };

    const cancel = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
      setDraggingVisual(false);
      if (previewToken !== null) {
        markerPreview.clear(previewToken);
        previewToken = null;
      }
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
    selectionMode,
    onSelectMarker,
    onMoveMarker,
    onSuppressActivation,
    getFlagElement,
    selection,
    markerPreview,
  ]);

  return { begin };
}
