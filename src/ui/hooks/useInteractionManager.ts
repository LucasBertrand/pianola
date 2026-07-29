import {
  useEffect,
  useRef,
  type RefObject,
} from "react";
import {
  MAXIMUM_HORIZONTAL_ZOOM,
  MAXIMUM_VERTICAL_ZOOM,
  MINIMUM_HORIZONTAL_ZOOM,
  MINIMUM_VERTICAL_ZOOM,
  type ViewportState,
} from "../../geometry/converter";
import type {
  InteractionManagerController,
  InteractionToolSignal,
  TouchAwareInteractionStrategy,
} from "../interactions/types";
import {
  isSupportedPointerActivation,
} from "../interactions/types";
import type {
  ReadonlyRenderSignal,
} from "../rendering/render-signal";

export interface UseInteractionManagerOptions {
  readonly overlayRef: RefObject<HTMLElement | null>;
  readonly strategyRef: RefObject<
    TouchAwareInteractionStrategy | null
  >;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly toolState: InteractionToolSignal;
  readonly totalTicks: number;
  readonly setViewport: (viewport: ViewportState) => void;
}

interface MutableGestureState {
  active: boolean;
  zoomAxis: "horizontal" | "vertical" | "both";
  previousDistance: number;
  previousSpanX: number;
  previousSpanY: number;
  previousMidpointX: number;
  previousMidpointY: number;
}

const LONG_PRESS_DELAY_MS = 560;
const PEN_LONG_PRESS_DELAY_MS = 280;
const LONG_PRESS_MOVEMENT_TOLERANCE_CSS_PIXELS = 12;
const MINIMUM_PINCH_DISTANCE_CSS_PIXELS = 8;
const PINCH_AXIS_LOCK_RATIO = 1.35;
const MINIMUM_PINCH_SCALE = 0.82;
const MAXIMUM_PINCH_SCALE = 1.22;
const PINCH_SCALE_DEAD_ZONE = 0.003;

export function useInteractionManager(
  options: UseInteractionManagerOptions,
): InteractionManagerController {
  const {
    overlayRef,
    strategyRef,
    viewport,
    toolState,
    totalTicks,
    setViewport,
  } = options;
  const controllerRef = useRef<InteractionManagerController | null>(
    null,
  );

  if (controllerRef.current === null) {
    controllerRef.current = {
      getActiveTool(): "select" {
        return "select";
      },
    };
  }

  useEffect(() => {
    const overlay = overlayRef.current;

    if (overlay === null) {
      return undefined;
    }

    const activePointers = new Map<number, PointerEvent>();
    const gestureEvents: PointerEvent[] = [];
    const gestureState: MutableGestureState = {
      active: false,
      zoomAxis: "both",
      previousDistance: 1,
      previousSpanX: 1,
      previousSpanY: 1,
      previousMidpointX: 0,
      previousMidpointY: 0,
    };
    let suppressSinglePointer = false;
    let gestureAnimationFrameId: number | null = null;
    let longPressTimerId: number | null = null;
    let longPressPointerId = -1;
    let longPressOriginX = 0;
    let longPressOriginY = 0;
    let longPressEvent: PointerEvent | null = null;

    const cancelLongPress = (): void => {
      if (longPressTimerId !== null) {
        window.clearTimeout(longPressTimerId);
        longPressTimerId = null;
      }

      longPressPointerId = -1;
      longPressEvent = null;
    };

    const populateGestureEvents = (): boolean => {
      gestureEvents.length = 0;

      for (const pointerEvent of activePointers.values()) {
        gestureEvents.push(pointerEvent);

        if (gestureEvents.length === 2) {
          break;
        }
      }

      return gestureEvents.length === 2;
    };

    const beginGesture = (): void => {
      if (!populateGestureEvents()) {
        return;
      }

      const first = gestureEvents[0];
      const second = gestureEvents[1];

      if (first === undefined || second === undefined) {
        return;
      }

      cancelLongPress();
      strategyRef.current?.cancel();
      suppressSinglePointer = true;

      const bounds = overlay.getBoundingClientRect();
      const midpointX =
        (first.clientX + second.clientX) / 2 - bounds.left;
      const midpointY =
        (first.clientY + second.clientY) / 2 - bounds.top;
      const deltaX = second.clientX - first.clientX;
      const deltaY = second.clientY - first.clientY;
      const spanX = Math.max(
        MINIMUM_PINCH_DISTANCE_CSS_PIXELS,
        Math.abs(deltaX),
      );
      const spanY = Math.max(
        MINIMUM_PINCH_DISTANCE_CSS_PIXELS,
        Math.abs(deltaY),
      );
      gestureState.active = true;
      gestureState.zoomAxis = classifyPinchZoomAxis(
        Math.abs(deltaX),
        Math.abs(deltaY),
      );
      gestureState.previousDistance = Math.max(
        MINIMUM_PINCH_DISTANCE_CSS_PIXELS,
        Math.hypot(deltaX, deltaY),
      );
      gestureState.previousSpanX = spanX;
      gestureState.previousSpanY = spanY;
      gestureState.previousMidpointX = midpointX;
      gestureState.previousMidpointY = midpointY;
      strategyRef.current?.onGesture(gestureEvents);
    };

    const updateGesture = (): void => {
      if (
        !gestureState.active
        || !populateGestureEvents()
      ) {
        return;
      }

      const first = gestureEvents[0];
      const second = gestureEvents[1];

      if (first === undefined || second === undefined) {
        return;
      }

      const bounds = overlay.getBoundingClientRect();
      const midpointX =
        (first.clientX + second.clientX) / 2 - bounds.left;
      const midpointY =
        (first.clientY + second.clientY) / 2 - bounds.top;
      const deltaX = second.clientX - first.clientX;
      const deltaY = second.clientY - first.clientY;
      const distance = Math.max(
        MINIMUM_PINCH_DISTANCE_CSS_PIXELS,
        Math.hypot(deltaX, deltaY),
      );
      const spanX = Math.max(
        MINIMUM_PINCH_DISTANCE_CSS_PIXELS,
        Math.abs(deltaX),
      );
      const spanY = Math.max(
        MINIMUM_PINCH_DISTANCE_CSS_PIXELS,
        Math.abs(deltaY),
      );
      const currentViewport = viewport.get();
      const uniformScale = normalizePinchScale(
        distance / gestureState.previousDistance,
      );
      const scaleX =
        gestureState.zoomAxis === "vertical"
          ? 1
          : gestureState.zoomAxis === "horizontal"
            ? normalizePinchScale(
                spanX / gestureState.previousSpanX,
              )
            : uniformScale;
      const scaleY =
        gestureState.zoomAxis === "horizontal"
          ? 1
          : gestureState.zoomAxis === "vertical"
            ? normalizePinchScale(
                spanY / gestureState.previousSpanY,
              )
            : uniformScale;
      const currentPitchHeight =
        currentViewport.pitchHeight * currentViewport.zoomY;
      const anchorTick =
        (
          currentViewport.scrollX
          + gestureState.previousMidpointX
        )
        * currentViewport.ticksPerPixel
        / currentViewport.zoomX;
      const anchorPitchRow =
        (
          currentViewport.scrollY
          + gestureState.previousMidpointY
        )
        / currentPitchHeight;
      const zoomX = clamp(
        currentViewport.zoomX * scaleX,
        MINIMUM_HORIZONTAL_ZOOM,
        MAXIMUM_HORIZONTAL_ZOOM,
      );
      const zoomY = clamp(
        currentViewport.zoomY * scaleY,
        MINIMUM_VERTICAL_ZOOM,
        MAXIMUM_VERTICAL_ZOOM,
      );
      const pitchHeight =
        currentViewport.pitchHeight * zoomY;
      const maximumScrollX = Math.max(
        0,
        totalTicks * zoomX / currentViewport.ticksPerPixel
          - overlay.clientWidth,
      );
      const maximumScrollY = Math.max(
        0,
        128 * pitchHeight - overlay.clientHeight,
      );
      const scrollX = clamp(
        anchorTick
          * zoomX
          / currentViewport.ticksPerPixel
          - midpointX,
        0,
        maximumScrollX,
      );
      const scrollY = clamp(
        anchorPitchRow * pitchHeight - midpointY,
        0,
        maximumScrollY,
      );

      gestureState.previousDistance = distance;
      gestureState.previousSpanX = spanX;
      gestureState.previousSpanY = spanY;
      gestureState.previousMidpointX = midpointX;
      gestureState.previousMidpointY = midpointY;
      setViewport({
        ...currentViewport,
        zoomX,
        zoomY,
        scrollX,
        scrollY,
      });
      strategyRef.current?.onGesture(gestureEvents);
    };

    const scheduleGestureUpdate = (): void => {
      if (gestureAnimationFrameId !== null) {
        return;
      }

      gestureAnimationFrameId = window.requestAnimationFrame(() => {
        gestureAnimationFrameId = null;
        updateGesture();
      });
    };

    const flushGestureUpdate = (): void => {
      if (gestureAnimationFrameId !== null) {
        window.cancelAnimationFrame(gestureAnimationFrameId);
        gestureAnimationFrameId = null;
      }

      updateGesture();
    };

    const scheduleLongPress = (event: PointerEvent): void => {
      cancelLongPress();

      longPressPointerId = event.pointerId;
      longPressOriginX = event.clientX;
      longPressOriginY = event.clientY;
      longPressEvent = event;
      const delay =
        event.pointerType === "pen"
          ? PEN_LONG_PRESS_DELAY_MS
          : LONG_PRESS_DELAY_MS;

      longPressTimerId = window.setTimeout(() => {
        const retainedEvent = longPressEvent;

        longPressTimerId = null;

        if (
          retainedEvent === null
          || gestureState.active
          || !activePointers.has(longPressPointerId)
        ) {
          return;
        }

        strategyRef.current?.cancel();
        strategyRef.current?.onLongPress(retainedEvent);
        suppressSinglePointer = false;
      }, delay);
    };

    const handlePointerDown = (event: PointerEvent): void => {
      if (!isSupportedPointerActivation(event)) {
        return;
      }

      activePointers.set(event.pointerId, event);

      if (!overlay.hasPointerCapture(event.pointerId)) {
        overlay.setPointerCapture(event.pointerId);
      }

      if (
        activePointers.size === 1
        && !suppressSinglePointer
      ) {
        const strategy = strategyRef.current;

        strategy?.onPointerDown(event);

        if (strategy?.shouldScheduleLongPress() === true) {
          scheduleLongPress(event);
        } else {
          cancelLongPress();
        }
      } else if (activePointers.size === 2) {
        beginGesture();
      }

      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent): void => {
      if (!activePointers.has(event.pointerId)) {
        return;
      }

      activePointers.set(event.pointerId, event);

      if (
        longPressPointerId === event.pointerId
        && (
          Math.abs(event.clientX - longPressOriginX)
            > LONG_PRESS_MOVEMENT_TOLERANCE_CSS_PIXELS
          || Math.abs(event.clientY - longPressOriginY)
            > LONG_PRESS_MOVEMENT_TOLERANCE_CSS_PIXELS
        )
      ) {
        cancelLongPress();
      }

      if (gestureState.active) {
        scheduleGestureUpdate();
      } else if (!suppressSinglePointer) {
        strategyRef.current?.onPointerMove(event);
      }

      event.preventDefault();
    };

    const finishPointer = (
      event: PointerEvent,
      cancelled: boolean,
    ): void => {
      if (!activePointers.has(event.pointerId)) {
        return;
      }

      cancelLongPress();

      if (
        !gestureState.active
        && !suppressSinglePointer
      ) {
        if (cancelled) {
          strategyRef.current?.onPointerCancel(event);
        } else {
          strategyRef.current?.onPointerUp(event);
        }
      }

      if (gestureState.active) {
        flushGestureUpdate();
      }

      activePointers.delete(event.pointerId);

      if (
        overlay.hasPointerCapture(event.pointerId)
      ) {
        overlay.releasePointerCapture(event.pointerId);
      }

      if (activePointers.size === 0) {
        gestureState.active = false;
        suppressSinglePointer = false;
        gestureEvents.length = 0;
      } else if (gestureState.active) {
        gestureState.active = false;
        suppressSinglePointer = true;
      }

      event.preventDefault();
    };

    const handlePointerUp = (event: PointerEvent): void => {
      finishPointer(event, false);
    };

    const handlePointerCancel = (
      event: PointerEvent,
    ): void => {
      finishPointer(event, true);
    };

    const handleLostPointerCapture = (
      event: PointerEvent,
    ): void => {
      if (activePointers.has(event.pointerId)) {
        activePointers.delete(event.pointerId);
        cancelLongPress();
        strategyRef.current?.cancel();
        gestureState.active = false;
        suppressSinglePointer = activePointers.size > 0;
      }
    };

    const handleDoubleClick = (event: MouseEvent): void => {
      strategyRef.current?.onDoubleClick(event);
    };

    const handleContextMenu = (event: MouseEvent): void => {
      event.preventDefault();
    };

    const updateToolDataset = (): void => {
      const state = toolState.get();

      overlay.dataset["activeTool"] = state.activeTool;
    };
    const unsubscribeToolState =
      toolState.subscribe(updateToolDataset);

    overlay.addEventListener("pointerdown", handlePointerDown);
    overlay.addEventListener("pointermove", handlePointerMove);
    overlay.addEventListener("pointerup", handlePointerUp);
    overlay.addEventListener("pointercancel", handlePointerCancel);
    overlay.addEventListener(
      "lostpointercapture",
      handleLostPointerCapture,
    );
    overlay.addEventListener("dblclick", handleDoubleClick);
    overlay.addEventListener("contextmenu", handleContextMenu);
    updateToolDataset();

    return (): void => {
      cancelLongPress();
      if (gestureAnimationFrameId !== null) {
        window.cancelAnimationFrame(gestureAnimationFrameId);
        gestureAnimationFrameId = null;
      }
      strategyRef.current?.cancel();
      unsubscribeToolState();
      activePointers.clear();
      overlay.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
      overlay.removeEventListener(
        "pointermove",
        handlePointerMove,
      );
      overlay.removeEventListener("pointerup", handlePointerUp);
      overlay.removeEventListener(
        "pointercancel",
        handlePointerCancel,
      );
      overlay.removeEventListener(
        "lostpointercapture",
        handleLostPointerCapture,
      );
      overlay.removeEventListener("dblclick", handleDoubleClick);
      overlay.removeEventListener(
        "contextmenu",
        handleContextMenu,
      );
    };
  }, [
    overlayRef,
    setViewport,
    strategyRef,
    toolState,
    totalTicks,
    viewport,
  ]);

  return controllerRef.current;
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function classifyPinchZoomAxis(
  spanX: number,
  spanY: number,
): MutableGestureState["zoomAxis"] {
  if (spanX >= spanY * PINCH_AXIS_LOCK_RATIO) {
    return "horizontal";
  }

  if (spanY >= spanX * PINCH_AXIS_LOCK_RATIO) {
    return "vertical";
  }

  return "both";
}

function normalizePinchScale(scale: number): number {
  if (
    !Number.isFinite(scale)
    || Math.abs(scale - 1) <= PINCH_SCALE_DEAD_ZONE
  ) {
    return 1;
  }

  return clamp(
    scale,
    MINIMUM_PINCH_SCALE,
    MAXIMUM_PINCH_SCALE,
  );
}
