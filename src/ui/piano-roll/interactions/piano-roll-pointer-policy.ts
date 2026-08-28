import {
  INTERACTION_CONSTANTS,
} from "../../../editor/interactions/interaction-constants";

/** Timing and movement policy shared by the DOM pointer manager. */
export const PIANO_ROLL_POINTER_POLICY = Object.freeze({
  longPressDelayMs: INTERACTION_CONSTANTS.longPressDelayMs,
  penLongPressDelayMs: INTERACTION_CONSTANTS.penLongPressDelayMs,
  longPressMovementToleranceCssPixels:
    INTERACTION_CONSTANTS.longPressMovementToleranceCssPixels,
  minimumPinchDistanceCssPixels:
    INTERACTION_CONSTANTS.minimumPinchDistanceCssPixels,
  pinchAxisLockRatio: INTERACTION_CONSTANTS.pinchAxisLockRatio,
  minimumPinchScale: INTERACTION_CONSTANTS.minimumPinchScale,
  maximumPinchScale: INTERACTION_CONSTANTS.maximumPinchScale,
  pinchScaleDeadZone: INTERACTION_CONSTANTS.pinchScaleDeadZone,
  twoFingerTapMaximumDurationMs:
    INTERACTION_CONSTANTS.twoFingerTapMaximumDurationMs,
  twoFingerTapMovementToleranceCssPixels:
    INTERACTION_CONSTANTS.twoFingerTapMovementToleranceCssPixels,
  twoFingerDoubleTapDelayMs:
    INTERACTION_CONSTANTS.twoFingerDoubleTapDelayMs,
  twoFingerDoubleTapDistanceCssPixels:
    INTERACTION_CONSTANTS.twoFingerDoubleTapDistanceCssPixels,
});
