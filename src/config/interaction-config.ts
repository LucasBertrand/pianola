const LONG_PRESS_DELAY_MS = 300;
const PEN_LONG_PRESS_DELAY_MS = 280;

/** Touch, pointer, keyboard-preview, and pinch gesture tuning. */
export const INTERACTION_CONSTANTS = Object.freeze({
  longPressDelayMs: LONG_PRESS_DELAY_MS,
  penLongPressDelayMs: PEN_LONG_PRESS_DELAY_MS,
  longPressMovementToleranceCssPixels: 12,
  loopDrawLongPressDelayMs: LONG_PRESS_DELAY_MS,
  loopDrawPenLongPressDelayMs: PEN_LONG_PRESS_DELAY_MS,
  pianoKeyLongPressDelayMs: 520,
  pianoKeyPenLongPressDelayMs: 280,
  pianoKeyLongPressMovementToleranceCssPixels: 10,
  instrumentNameLongPressDelayMs: 520,
  instrumentNameLongPressMovementToleranceCssPixels: 10,
  touchDoubleTapDelayMs: 360,
  touchDoubleTapDistanceCssPixels: 24,
  tapMovementToleranceCssPixels: 10,
  twoFingerTapMaximumDurationMs: 280,
  twoFingerTapMovementToleranceCssPixels: 10,
  twoFingerDoubleTapDelayMs: 360,
  twoFingerDoubleTapDistanceCssPixels: 32,
  mouseResizeHandleCssPixels: 8,
  touchResizeHandleCssPixels: 16,
  mouseNoteHitEnvelopeCssPixels: 2,
  touchNoteHitEnvelopeCssPixels: 10,
  minimumPinchDistanceCssPixels: 8,
  pinchAxisLockRatio: 1.35,
  minimumPinchScale: 0.82,
  maximumPinchScale: 1.22,
  pinchScaleDeadZone: 0.003,
} as const);
