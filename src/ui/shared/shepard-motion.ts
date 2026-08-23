export interface ShepardMotionOptions {
  readonly periodPixels: number;
  readonly speedPixelsPerSecond: number;
  readonly gradientAngleDegrees: number;
  readonly direction?: 1 | -1;
  readonly respectReducedMotion?: boolean;
}

export interface ShepardMotionFrame {
  readonly phasePixels: number;
  readonly offsetXPixels: number;
  readonly offsetYPixels: number;
}

export interface ShepardMotionStyleTarget {
  readonly style: Pick<CSSStyleDeclaration, "setProperty">;
  readonly animate: (
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options?: number | KeyframeAnimationOptions,
  ) => Pick<Animation, "cancel">;
}

export interface ShepardAnimationPort {
  readonly prefersReducedMotion: () => boolean;
}

export interface ShepardMotionController {
  readonly start: () => void;
  readonly stop: () => void;
  readonly isRunning: () => boolean;
}

export const SHEPARD_PHASE_PROPERTY = "--shepard-phase";
export const SHEPARD_OFFSET_X_PROPERTY = "--shepard-offset-x";
export const SHEPARD_OFFSET_Y_PROPERTY = "--shepard-offset-y";

const FULL_TURN_DEGREES = 360;
const MILLISECONDS_PER_SECOND = 1_000;
const CSS_VALUE_PRECISION = 3;

export function calculateShepardMotionFrame(
  elapsedMilliseconds: number,
  options: ShepardMotionOptions,
): ShepardMotionFrame {
  validateOptions(options);

  if (!Number.isFinite(elapsedMilliseconds)) {
    throw new RangeError("Shepard motion elapsed time must be finite.");
  }

  const direction = options.direction ?? 1;
  const elapsedSeconds = Math.max(0, elapsedMilliseconds)
    / MILLISECONDS_PER_SECOND;
  const distance = elapsedSeconds * options.speedPixelsPerSecond * direction;
  const phasePixels = wrap(distance, options.periodPixels);
  const angleRadians = options.gradientAngleDegrees
    * Math.PI
    / (FULL_TURN_DEGREES / 2);

  // CSS gradient angles start upwards and rotate clockwise. Moving along this
  // vector changes the phase normally to the stripes, producing the endless
  // barber-pole (Shepard) illusion instead of a simple horizontal slide. The
  // visual offsets deliberately stay continuous: resetting them at each period
  // is mathematically equivalent, but can expose a rasterization seam.
  return {
    phasePixels,
    offsetXPixels: normalizeNearZero(
      Math.sin(angleRadians) * distance,
      distance,
    ),
    offsetYPixels: normalizeNearZero(
      -Math.cos(angleRadians) * distance,
      distance,
    ),
  };
}

export function createShepardMotionController(
  target: ShepardMotionStyleTarget,
  options: ShepardMotionOptions,
  animationPort: ShepardAnimationPort = createBrowserAnimationPort(),
): ShepardMotionController {
  validateOptions(options);

  let animation: Pick<Animation, "cancel"> | null = null;
  let running = false;

  const publishFrame = (frame: ShepardMotionFrame): void => {
    target.style.setProperty(
      SHEPARD_PHASE_PROPERTY,
      formatPixelValue(frame.phasePixels),
    );
    target.style.setProperty(
      SHEPARD_OFFSET_X_PROPERTY,
      formatPixelValue(frame.offsetXPixels),
    );
    target.style.setProperty(
      SHEPARD_OFFSET_Y_PROPERTY,
      formatPixelValue(frame.offsetYPixels),
    );
  };

  const start = (): void => {
    if (running) {
      return;
    }

    const initialFrame = calculateShepardMotionFrame(0, options);
    publishFrame(initialFrame);
    target.style.setProperty(
      "transform",
      formatTranslate3d(initialFrame),
    );
    if (
      options.speedPixelsPerSecond === 0
      || (
      (options.respectReducedMotion ?? true)
      && animationPort.prefersReducedMotion()
      )
    ) {
      return;
    }

    const cycleDurationMilliseconds = options.periodPixels
      / options.speedPixelsPerSecond
      * MILLISECONDS_PER_SECOND;
    const finalFrame = calculateShepardMotionFrame(
      cycleDurationMilliseconds,
      options,
    );
    animation = target.animate([
      { transform: formatTranslate3d(initialFrame) },
      { transform: formatTranslate3d(finalFrame) },
    ], {
      duration: cycleDurationMilliseconds,
      easing: "linear",
      iterations: Infinity,
    });
    running = true;
  };

  const stop = (): void => {
    running = false;
    animation?.cancel();
    animation = null;
    target.style.setProperty("transform", formatTranslate3d(
      calculateShepardMotionFrame(0, options),
    ));
  };

  return {
    start,
    stop,
    isRunning: () => running,
  };
}

function createBrowserAnimationPort(): ShepardAnimationPort {
  return {
    prefersReducedMotion: () => window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches,
  };
}

function validateOptions(options: ShepardMotionOptions): void {
  if (!Number.isFinite(options.periodPixels) || options.periodPixels <= 0) {
    throw new RangeError("Shepard motion period must be greater than zero.");
  }
  if (
    !Number.isFinite(options.speedPixelsPerSecond)
    || options.speedPixelsPerSecond < 0
  ) {
    throw new RangeError("Shepard motion speed cannot be negative.");
  }
  if (!Number.isFinite(options.gradientAngleDegrees)) {
    throw new RangeError("Shepard motion angle must be finite.");
  }
  if (
    options.direction !== undefined
    && options.direction !== 1
    && options.direction !== -1
  ) {
    throw new RangeError("Shepard motion direction must be 1 or -1.");
  }
}

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

function normalizeNearZero(value: number, scale: number): number {
  const floatingPointTolerance = Number.EPSILON
    * Math.max(1, Math.abs(scale))
    * 16;
  return Math.abs(value) < floatingPointTolerance ? 0 : value;
}

function formatPixelValue(value: number): string {
  return `${String(Number(value.toFixed(CSS_VALUE_PRECISION)))}px`;
}

function formatTranslate3d(frame: ShepardMotionFrame): string {
  return `translate3d(${formatPixelValue(frame.offsetXPixels)}, ${
    formatPixelValue(frame.offsetYPixels)
  }, 0)`;
}
