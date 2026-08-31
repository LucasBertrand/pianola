import {
  getSliderValueFromPointerDelta,
  type SliderValueConstraints,
} from "./slider-value";

export interface SliderPointerSession {
  readonly pointerId: number;
  readonly initialClientX: number;
  readonly initialValue: number;
  readonly currentValue: number;
  readonly trackLengthCssPixels: number;
}

/** Starts an immutable relative-drag session without changing the value. */
export function startSliderPointerSession(
  pointerId: number,
  clientX: number,
  value: number,
  trackLengthCssPixels: number,
): SliderPointerSession {
  return {
    pointerId,
    initialClientX: clientX,
    initialValue: value,
    currentValue: value,
    trackLengthCssPixels,
  };
}

/** Projects a matching pointer sample from the session's initial position. */
export function moveSliderPointerSession(
  session: SliderPointerSession,
  pointerId: number,
  clientX: number,
  constraints: SliderValueConstraints,
): SliderPointerSession {
  if (pointerId !== session.pointerId) {
    return session;
  }

  const currentValue = getSliderValueFromPointerDelta(
    session.initialValue,
    clientX - session.initialClientX,
    session.trackLengthCssPixels,
    constraints,
  );

  return currentValue === session.currentValue
    ? session
    : { ...session, currentValue };
}

/** Resolves a matching session to its previewed or restored value. */
export function endSliderPointerSession(
  session: SliderPointerSession,
  pointerId: number,
  outcome: "commit" | "cancel",
): number | null {
  if (pointerId !== session.pointerId) {
    return null;
  }

  return outcome === "commit" ? session.currentValue : session.initialValue;
}
