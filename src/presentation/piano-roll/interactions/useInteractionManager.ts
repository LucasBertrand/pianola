import {
  useEffect,
} from "react";
import {
  MAXIMUM_HORIZONTAL_ZOOM,
  MAXIMUM_VERTICAL_ZOOM,
} from "../../../editor-core/geometry/converter";
import {
  isSupportedPointerActivation,
} from "../../../editor-core/interactions/pointer/pointer-interaction-strategy";
import type {
  PointerSample,
} from "../../../editor-core/interactions/pointer/pointer-sample";
import {
  PinchViewportGesture,
} from "../../../editor-core/interactions/gestures/pinch-viewport-gesture";
import {
  TwoPointerDoubleTapGesture,
} from "../../../editor-core/interactions/gestures/two-pointer-double-tap";
import {
  createPointerSample,
} from "./dom-pointer-sample";
import {
  PIANO_ROLL_POINTER_POLICY,
} from "./piano-roll-pointer-policy";
import {
  bindPianoRollPointerEvents,
} from "./bind-piano-roll-pointer-events";
import type {
  UseInteractionManagerOptions,
} from "./piano-roll-interaction-manager-options";

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
        PIANO_ROLL_POINTER_POLICY.minimumPinchDistanceCssPixels,
      axisLockRatio: PIANO_ROLL_POINTER_POLICY.pinchAxisLockRatio,
      minimumScale: PIANO_ROLL_POINTER_POLICY.minimumPinchScale,
      maximumScale: PIANO_ROLL_POINTER_POLICY.maximumPinchScale,
      scaleDeadZone: PIANO_ROLL_POINTER_POLICY.pinchScaleDeadZone,
      maximumZoomX: MAXIMUM_HORIZONTAL_ZOOM,
      maximumZoomY: MAXIMUM_VERTICAL_ZOOM,
    });
    const twoPointerDoubleTap = new TwoPointerDoubleTapGesture({
      maximumDelayMs: PIANO_ROLL_POINTER_POLICY.twoFingerDoubleTapDelayMs,
      maximumDistanceCssPixels:
        PIANO_ROLL_POINTER_POLICY.twoFingerDoubleTapDistanceCssPixels,
    });
    let suppressSinglePointer = false;
    let gestureAnimationFrameId: number | null = null;
    let longPressTimerId: number | null = null;
    let longPressPointerId = -1;
    let longPressOriginX = 0;
    let longPressOriginY = 0;
    let longPressEvent: PointerSample | null = null;
    let viewportInteractionActive = false;
    let gestureFirstPointerId = -1;
    let gestureSecondPointerId = -1;
    let gestureStartTimeStamp = 0;
    let gestureCenterX = 0;
    let gestureCenterY = 0;
    let gestureMoved = false;
    let gestureUsesTouchPointers = false;

    const beginViewportInteraction = (): void => {
      if (viewportInteractionActive) {
        return;
      }

      // Playback following must not page the grid underneath an active
      // pointer. The interaction remains suspended until the last pointer
      // finishes, including across a transition into a pinch gesture.
      viewportInteractionActive = true;
      onHorizontalViewportInteractionStart();
    };

    const endViewportInteraction = (): void => {
      if (!viewportInteractionActive) {
        return;
      }

      viewportInteractionActive = false;
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
        PIANO_ROLL_POINTER_POLICY.twoFingerTapMovementToleranceCssPixels
        * PIANO_ROLL_POINTER_POLICY.twoFingerTapMovementToleranceCssPixels;
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
          ? PIANO_ROLL_POINTER_POLICY.penLongPressDelayMs
          : PIANO_ROLL_POINTER_POLICY.longPressDelayMs;

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

      if (activePointers.size === 1) {
        beginViewportInteraction();
      }

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
            > PIANO_ROLL_POINTER_POLICY.longPressMovementToleranceCssPixels
          || Math.abs(event.clientY - longPressOriginY)
            > PIANO_ROLL_POINTER_POLICY.longPressMovementToleranceCssPixels
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
          <= PIANO_ROLL_POINTER_POLICY.twoFingerTapMaximumDurationMs;

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
        endViewportInteraction();
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

    const handleLostPointerCapture = (
      event: PointerEvent,
    ): void => {
      if (activePointers.has(event.pointerId)) {
        const wasViewportGesture = pinchGesture.active;

        activePointers.delete(event.pointerId);
        pointerOrigins.delete(event.pointerId);
        cancelLongPress();
        strategyRef.current?.cancel();
        pinchGesture.reset();
        suppressSinglePointer = activePointers.size > 0;

        if (activePointers.size === 0) {
          endViewportInteraction();
        }

        if (wasViewportGesture) {
          twoPointerDoubleTap.reset();
        }
      }
    };

    const unbindPointerEvents = bindPianoRollPointerEvents(
      overlay,
      strategyRef,
      {
        pointerDown: handlePointerDown,
        pointerMove: handlePointerMove,
        finishPointer,
        lostPointerCapture: handleLostPointerCapture,
      },
    );
    return (): void => {
      cancelLongPress();
      if (gestureAnimationFrameId !== null) {
        window.cancelAnimationFrame(gestureAnimationFrameId);
        gestureAnimationFrameId = null;
      }
      strategyRef.current?.cancel();
      activePointers.clear();
      pointerOrigins.clear();
      endViewportInteraction();
      twoPointerDoubleTap.reset();
      unbindPointerEvents();
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
