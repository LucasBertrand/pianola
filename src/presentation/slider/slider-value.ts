export type SliderStep = number | "any";

export interface SliderValueConstraints {
  readonly minimum: number;
  readonly maximum: number;
  readonly step: SliderStep;
}

export type SliderNavigationKey =
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "End"
  | "Home"
  | "PageDown"
  | "PageUp";

/** Clamps and aligns a slider value to its step, whose base is the minimum. */
export function normalizeSliderValue(
  value: number,
  constraints: SliderValueConstraints,
): number {
  const { minimum, maximum, step } = constraints;
  const finiteValue = Number.isFinite(value) ? value : minimum;
  const clampedValue = Math.min(maximum, Math.max(minimum, finiteValue));

  if (step === "any") {
    return clampedValue;
  }

  const stepCount = Math.round((clampedValue - minimum) / step);
  const alignedValue = minimum + stepCount * step;

  return Math.min(
    maximum,
    Math.max(minimum, roundSliderValue(alignedValue, minimum, maximum, step)),
  );
}

/** Maps a relative horizontal pointer displacement to a normalized value. */
export function getSliderValueFromPointerDelta(
  initialValue: number,
  deltaCssPixels: number,
  trackLengthCssPixels: number,
  constraints: SliderValueConstraints,
): number {
  if (
    !Number.isFinite(deltaCssPixels)
    || !Number.isFinite(trackLengthCssPixels)
    || trackLengthCssPixels <= 0
  ) {
    return normalizeSliderValue(initialValue, constraints);
  }

  const valueRange = constraints.maximum - constraints.minimum;

  return normalizeSliderValue(
    initialValue + deltaCssPixels / trackLengthCssPixels * valueRange,
    constraints,
  );
}

/** Resolves the standard range-input keyboard navigation for one key press. */
export function getSliderValueFromNavigationKey(
  currentValue: number,
  key: string,
  constraints: SliderValueConstraints,
): number | null {
  if (!isSliderNavigationKey(key)) {
    return null;
  }

  if (key === "Home") {
    return normalizeSliderValue(constraints.minimum, constraints);
  }

  if (key === "End") {
    return normalizeSliderValue(constraints.maximum, constraints);
  }

  const direction = key === "ArrowRight"
    || key === "ArrowUp"
    || key === "PageUp"
    ? 1
    : -1;
  const baseStep = constraints.step === "any"
    ? (constraints.maximum - constraints.minimum) / 100
    : constraints.step;
  const multiplier = key === "PageDown" || key === "PageUp" ? 10 : 1;

  return normalizeSliderValue(
    currentValue + direction * baseStep * multiplier,
    constraints,
  );
}

function isSliderNavigationKey(key: string): key is SliderNavigationKey {
  return key === "ArrowDown"
    || key === "ArrowLeft"
    || key === "ArrowRight"
    || key === "ArrowUp"
    || key === "End"
    || key === "Home"
    || key === "PageDown"
    || key === "PageUp";
}

function roundSliderValue(
  value: number,
  minimum: number,
  maximum: number,
  step: number,
): number {
  const precision = Math.min(
    12,
    Math.max(
      getDecimalPrecision(minimum),
      getDecimalPrecision(maximum),
      getDecimalPrecision(step),
    ),
  );

  return Number(value.toFixed(precision));
}

function getDecimalPrecision(value: number): number {
  const text = String(value).toLowerCase();
  const [coefficient = "", exponentText] = text.split("e");
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const decimalIndex = coefficient.indexOf(".");
  const coefficientPrecision = decimalIndex < 0
    ? 0
    : coefficient.length - decimalIndex - 1;

  return Math.max(0, coefficientPrecision - exponent);
}
