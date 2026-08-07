import {
  useEffect,
  type RefObject,
} from "react";
import {
  INTERACTION_CONSTANTS,
} from "../../config/program-constants";
import {
  MAXIMUM_HORIZONTAL_ZOOM,
  MAXIMUM_VERTICAL_ZOOM,
  MINIMUM_HORIZONTAL_ZOOM,
  MINIMUM_VERTICAL_ZOOM,
  type ViewportState,
} from "../../geometry/converter";
import {
  type PointerInteractionStrategy,
  isSupportedPointerActivation,
} from "../../interaction/pointer-interaction-strategy";
import type {
  ReadonlyRenderSignal,
} from "../rendering/render-signal";
import type {
  PointerSample,
} from "../../interaction/core/input";
import {
  PinchViewportGesture,
} from "../../interaction/core/pinch-viewport-gesture";
import {
  createMousePointerSample,
  createPointerSample,
} from "../interactions/pointer-sample";

export interface UseInteractionManagerOptions {
  readonly overlayRef: RefObject<HTMLElement | null>;
  readonly strategyRef: RefObject<
    PointerInteractionStrategy | null
  >;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly totalTicks: number;
  readonly setViewport: (viewport: ViewportState) => void;
}

const LONG_PRESS_DELAY_MS =
  INTERACTION_CONSTANTS.longPressDelayMs;
const PEN_LONG_PRESS_DELAY_MS =
  INTERACTION_CONSTANTS.penLongPressDelayMs;
const LONG_PRESS_MOVEMENT_TOLERANCE_CSS_PIXELS =
  INTERACTION_CONSTANTS.longPressMovementToleranceCssPixels;
const MINIMUM_PINCH_DISTANCE_CSS_PIXELS =
  INTERACTION_CONSTANTS.minimumPinchDistanceCssPixels;
const PINCH_AXIS_LOCK_RATIO =
  INTERACTION_CONSTANTS.pinchAxisLockRatio;
const MINIMUM_PINCH_SCALE =
  INTERACTION_CONSTANTS.minimumPinchScale;
const MAXIMUM_PINCH_SCALE =
  INTERACTION_CONSTANTS.maximumPinchScale;
const PINCH_SCALE_DEAD_ZONE =
  INTERACTION_CONSTANTS.pinchScaleDeadZone;

export function useInteractionManager(
  options: UseInteractionManagerOptions,
): void {
  const {
    overlayRef,
    strategyRef,
    viewport,
    totalTicks,
    setViewport,
  } = options;

  useEffect(() => {
    const overlay = overlayRef.current;

    if (overlay === null) {
      return undefined;
    }

    const activePointers = new Map<number, PointerSample>();
    const gestureEvents: PointerSample[] = [];
    const pinchGesture = new PinchViewportGesture({
      minimumDistanceCssPixels:
        MINIMUM_PINCH_DISTANCE_CSS_PIXELS,
      axisLockRatio: PINCH_AXIS_LOCK_RATIO,
      minimumScale: MINIMUM_PINCH_SCALE,
      maximumScale: MAXIMUM_PINCH_SCALE,
      scaleDeadZone: PINCH_SCALE_DEAD_ZONE,
      minimumZoomX: MINIMUM_HORIZONTAL_ZOOM,
      maximumZoomX: MAXIMUM_HORIZONTAL_ZOOM,
      minimumZoomY: MINIMUM_VERTICAL_ZOOM,
      maximumZoomY: MAXIMUM_VERTICAL_ZOOM,
      pitchCount: 128,
    });
    let suppressSinglePointer = false;
    let gestureAnimationFrameId: number | null = null;
    let longPressTimerId: number | null = null;
    let longPressPointerId = -1;
    let longPressOriginX = 0;
    let longPressOriginY = 0;
    let longPressEvent: PointerSample | null = null;

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
      pinchGesture.begin(
        first,
        second,
        bounds.left,
        bounds.top,
      );
      strategyRef.current?.onGesture(gestureEvents);
    };

    const updateGesture = (): void => {
      if (
        !pinchGesture.active
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
      const currentViewport = viewport.get();
      const nextViewport = pinchGesture.update(
        first,
        second,
        bounds.left,
        bounds.top,
        overlay.clientWidth,
        overlay.clientHeight,
        totalTicks,
        currentViewport,
      );

      if (nextViewport !== null) {
        setViewport(nextViewport);
      }
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

    const scheduleLongPress = (event: PointerSample): void => {
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
          || pinchGesture.active
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

      const sample = createPointerSample(event);

      activePointers.set(event.pointerId, sample);

      if (!overlay.hasPointerCapture(event.pointerId)) {
        overlay.setPointerCapture(event.pointerId);
      }

      if (
        activePointers.size === 1
        && !suppressSinglePointer
      ) {
        const strategy = strategyRef.current;

        strategy?.onPointerDown(sample);

        if (strategy?.shouldScheduleLongPress() === true) {
          scheduleLongPress(sample);
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

      const sample = createPointerSample(event);

      activePointers.set(event.pointerId, sample);

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

      if (pinchGesture.active) {
        scheduleGestureUpdate();
      } else if (!suppressSinglePointer) {
        strategyRef.current?.onPointerMove(sample);
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
      const sample = createPointerSample(event);

      if (
        !pinchGesture.active
        && !suppressSinglePointer
      ) {
        if (cancelled) {
          strategyRef.current?.onPointerCancel(sample);
        } else {
          strategyRef.current?.onPointerUp(sample);
        }
      }

      if (pinchGesture.active) {
        flushGestureUpdate();
      }

      activePointers.delete(event.pointerId);

      if (
        overlay.hasPointerCapture(event.pointerId)
      ) {
        overlay.releasePointerCapture(event.pointerId);
      }

      if (activePointers.size === 0) {
        pinchGesture.reset();
        suppressSinglePointer = false;
        gestureEvents.length = 0;
      } else if (pinchGesture.active) {
        pinchGesture.reset();
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
        pinchGesture.reset();
        suppressSinglePointer = activePointers.size > 0;
      }
    };

    const handleDoubleClick = (event: MouseEvent): void => {
      strategyRef.current?.onDoubleClick(
        createMousePointerSample(event),
      );
      event.preventDefault();
    };

    const handleContextMenu = (event: MouseEvent): void => {
      event.preventDefault();
    };

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
    return (): void => {
      cancelLongPress();
      if (gestureAnimationFrameId !== null) {
        window.cancelAnimationFrame(gestureAnimationFrameId);
        gestureAnimationFrameId = null;
      }
      strategyRef.current?.cancel();
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
    totalTicks,
    viewport,
  ]);

}
