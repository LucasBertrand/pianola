import {
  describe,
  expect,
  test,
} from "vitest";
import {
  endSliderPointerSession,
  moveSliderPointerSession,
  startSliderPointerSession,
} from "../slider-pointer-session";

const CONSTRAINTS = {
  minimum: 0,
  maximum: 1,
  step: 0.1,
} as const;

describe("slider pointer session", () => {
  test("starts on the current value without applying the pointer position", () => {
    expect(startSliderPointerSession(7, 180, 0.4, 200)).toEqual({
      pointerId: 7,
      initialClientX: 180,
      initialValue: 0.4,
      currentValue: 0.4,
      restorationValue: 0.4,
      trackLengthCssPixels: 200,
    });
  });

  test("moves immediately and relatively from the initial value", () => {
    const started = startSliderPointerSession(7, 180, 0.4, 200);
    const moved = moveSliderPointerSession(started, 7, 200, CONSTRAINTS);

    expect(moved.currentValue).toBe(0.5);
  });

  test("ignores samples from another pointer", () => {
    const started = startSliderPointerSession(7, 180, 0.4, 200);

    expect(moveSliderPointerSession(started, 8, 240, CONSTRAINTS)).toBe(started);
    expect(endSliderPointerSession(started, 8, "commit")).toBeNull();
  });

  test("commits the previewed value once the matching pointer ends", () => {
    const started = startSliderPointerSession(7, 180, 0.4, 200);
    const moved = moveSliderPointerSession(started, 7, 220, CONSTRAINTS);

    expect(endSliderPointerSession(moved, 7, "commit")).toBe(0.6);
  });

  test("restores the initial value when the matching pointer is cancelled", () => {
    const started = startSliderPointerSession(7, 180, 0.4, 200);
    const moved = moveSliderPointerSession(started, 7, 220, CONSTRAINTS);

    expect(endSliderPointerSession(moved, 7, "cancel")).toBe(0.4);
  });

  test("restores the pre-jump value when a track gesture is cancelled", () => {
    const started = startSliderPointerSession(7, 180, 0.8, 200, 0.4);
    const moved = moveSliderPointerSession(started, 7, 200, CONSTRAINTS);

    expect(endSliderPointerSession(moved, 7, "cancel")).toBe(0.4);
  });
});
