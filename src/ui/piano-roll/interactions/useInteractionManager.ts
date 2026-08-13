import {
  useEffect,
  type RefObject,
} from "react";
import {
  INTERACTION_CONSTANTS,
} from "../../../config/interaction-config";
import {
  MAXIMUM_HORIZONTAL_ZOOM,
  MAXIMUM_VERTICAL_ZOOM,
  type ViewportState,
} from "../../../editor/geometry/converter";
import {
  type PointerInteractionStrategy,
  isSupportedPointerActivation,
} from "../../../editor/interactions/pointer/pointer-interaction-strategy";
import type {
  ReadonlyRenderSignal,
} from "../../../editor/model/render-signal";
import type {
  PointerSample,
} from "../../../editor/interactions/pointer/pointer-sample";
import {
  PinchViewportGesture,
} from "../../../editor/interactions/gestures/pinch-viewport-gesture";
import {
  TwoPointerDoubleTapGesture,
} from "../../../editor/interactions/gestures/two-pointer-double-tap";
import {
  createMousePointerSample,
  createPointerSample,
} from "./dom-pointer-sample";

export interface UseInteractionManagerOptions {
  readonly overlayRef: RefObject<HTMLElement | null>;
  readonly strategyRef: RefObject<
    PointerInteractionStrategy | null
  >;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly totalTicks: number;
  readonly setViewport: (viewport: ViewportState) => void;
  readonly onHorizontalViewportInteractionStart: () => void;
  readonly onHorizontalViewportInteractionEnd: () => void;
  readonly onTwoFingerDoubleTap: () => void;
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
const TWO_FINGER_TAP_MAXIMUM_DURATION_MS =
  INTERACTION_CONSTANTS.twoFingerTapMaximumDurationMs;
const TWO_FINGER_TAP_MOVEMENT_TOLERANCE_CSS_PIXELS =
  INTERACTION_CONSTANTS.twoFingerTapMovementToleranceCssPixels;
const TWO_FINGER_DOUBLE_TAP_DELAY_MS =
  INTERACTION_CONSTANTS.twoFingerDoubleTapDelayMs;
const TWO_FINGER_DOUBLE_TAP_DISTANCE_CSS_PIXELS =
  INTERACTION_CONSTANTS.twoFingerDoubleTapDistanceCssPixels;

export function useInteractionManager(
  options: UseInteractionManagerOptions,
): void {
  const {
    overlayRef,
    strategyRef,
    viewport,
    totalTicks,
    setViewport,
    onHorizontalViewportInteractionStart,
    onHorizontalViewportInteractionEnd,
    onTwoFingerDoubleTap,
  } = options;

  useEffect(() => {
    const overlay = overlayRef.current;

    if (overlay === null) {
      return undefined;
    }

    const activePointers = new Map<number, PointerSample>();
    const pointerOrigins = new Map<number, PointerSample>();
    const gestureEvents: PointerSample[] = [];
    const pinchGesture = new PinchViewportGesture({
      minimumDistanceCssPixels:
        MINIMUM_PINCH_DISTANCE_CSS_PIXELS,
      axisLockRatio: PINCH_AXIS_LOCK_RATIO,
      minimumScale: MINIMUM_PINCH_SCALE,
      maximumScale: MAXIMUM_PINCH_SCALE,
      scaleDeadZone: PINCH_SCALE_DEAD_ZONE,
      maximumZoomX: MAXIMUM_HORIZONTAL_ZOOM,
      maximumZoomY: MAXIMUM_VERTICAL_ZOOM,
    });
    const twoPointerDoubleTap = new TwoPointerDoubleTapGesture({
      maximumDelayMs: TWO_FINGER_DOUBLE_TAP_DELAY_MS,
      maximumDistanceCssPixels:
        TWO_FINGER_DOUBLE_TAP_DISTANCE_CSS_PIXELS,
    });
    let suppressSinglePointer = false;
    let gestureAnimationFrameId: number | null = null;
    let longPressTimerId: number | null = null;
    let longPressPointerId = -1;
    let longPressOriginX = 0;
    let longPressOriginY = 0;
    let longPressEvent: PointerSample | null = null;
    let viewportGestureActive = false;
    let gestureFirstPointerId = -1;
    let gestureSecondPointerId = -1;
    let gestureStartTimeStamp = 0;
    let gestureCenterX = 0;
    let gestureCenterY = 0;
    let gestureMoved = false;
    let gestureUsesTouchPointers = false;

    const endViewportGesture = (): void => {
      if (!viewportGestureActive) {
        return;
      }

      viewportGestureActive = false;
      onHorizontalViewportInteractionEnd();
    };

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

    const didGestureMoveBeyondTapTolerance = (): boolean => {
      const first = activePointers.get(gestureFirstPointerId);
      const second = activePointers.get(gestureSecondPointerId);
      const firstOrigin = pointerOrigins.get(gestureFirstPointerId);
      const secondOrigin = pointerOrigins.get(gestureSecondPointerId);

      if (
        first === undefined
        || second === undefined
        || firstOrigin === undefined
        || secondOrigin === undefined
      ) {
        return true;
      }

      const toleranceSquared =
        TWO_FINGER_TAP_MOVEMENT_TOLERANCE_CSS_PIXELS
        * TWO_FINGER_TAP_MOVEMENT_TOLERANCE_CSS_PIXELS;
      const firstDeltaX = first.clientX - firstOrigin.clientX;
      const firstDeltaY = first.clientY - firstOrigin.clientY;
      const secondDeltaX = second.clientX - secondOrigin.clientX;
      const secondDeltaY = second.clientY - secondOrigin.clientY;

      return firstDeltaX * firstDeltaX + firstDeltaY * firstDeltaY
          > toleranceSquared
        || secondDeltaX * secondDeltaX + secondDeltaY * secondDeltaY
          > toleranceSquared;
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
      const firstOrigin = pointerOrigins.get(first.pointerId) ?? first;
      const secondOrigin = pointerOrigins.get(second.pointerId) ?? second;

      gestureFirstPointerId = first.pointerId;
      gestureSecondPointerId = second.pointerId;
      gestureStartTimeStamp = Math.min(
        firstOrigin.timeStamp,
        secondOrigin.timeStamp,
      );
      gestureCenterX =
        (firstOrigin.clientX + secondOrigin.clientX) / 2;
      gestureCenterY =
        (firstOrigin.clientY + secondOrigin.clientY) / 2;
      gestureMoved = false;
      gestureUsesTouchPointers =
        first.pointerType === "touch"
        && second.pointerType === "touch";
      pinchGesture.begin(
        first,
        second,
        bounds.left,
        bounds.top,
      );
      viewportGestureActive = true;
      onHorizontalViewportInteractionStart();
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

      if (!gestureMoved) {
        gestureMoved = didGestureMoveBeyondTapTolerance();

        if (!gestureMoved) {
          return;
        }

        twoPointerDoubleTap.reset();
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
      pointerOrigins.set(event.pointerId, sample);

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
      activePointers.set(event.pointerId, sample);
      const wasViewportGesture = pinchGesture.active;
      const exceededTapTolerance =
        wasViewportGesture
        && didGestureMoveBeyondTapTolerance();

      if (exceededTapTolerance && !gestureMoved) {
        gestureMoved = true;
        twoPointerDoubleTap.reset();
      }

      const gestureWasTap =
        wasViewportGesture
        && !cancelled
        && gestureUsesTouchPointers
        && !gestureMoved
        && sample.timeStamp - gestureStartTimeStamp
          <= TWO_FINGER_TAP_MAXIMUM_DURATION_MS;

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

      if (wasViewportGesture) {
        if (gestureMoved) {
          flushGestureUpdate();
        } else if (gestureAnimationFrameId !== null) {
          window.cancelAnimationFrame(gestureAnimationFrameId);
          gestureAnimationFrameId = null;
        }

        endViewportGesture();
      }

      activePointers.delete(event.pointerId);
      pointerOrigins.delete(event.pointerId);

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

      if (wasViewportGesture) {
        if (gestureWasTap) {
          if (
            twoPointerDoubleTap.recordTap(
              sample.timeStamp,
              gestureCenterX,
              gestureCenterY,
            )
          ) {
            onTwoFingerDoubleTap();
          }
        } else {
          twoPointerDoubleTap.reset();
        }
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
        const wasViewportGesture = pinchGesture.active;

        activePointers.delete(event.pointerId);
        pointerOrigins.delete(event.pointerId);
        cancelLongPress();
        strategyRef.current?.cancel();
        endViewportGesture();
        pinchGesture.reset();
        suppressSinglePointer = activePointers.size > 0;

        if (wasViewportGesture) {
          twoPointerDoubleTap.reset();
        }
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
      endViewportGesture();
      activePointers.clear();
      pointerOrigins.clear();
      twoPointerDoubleTap.reset();
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
    onHorizontalViewportInteractionEnd,
    onHorizontalViewportInteractionStart,
    onTwoFingerDoubleTap,
    setViewport,
    strategyRef,
    totalTicks,
    viewport,
  ]);

}
