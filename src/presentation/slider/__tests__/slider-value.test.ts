import {
  describe,
  expect,
  test,
} from "vitest";
import {
  getSliderTrackLength,
  getSliderValueFromNavigationKey,
  getSliderValueFromPointerDelta,
  getSliderValueFromPointerPosition,
  isPointerOnSliderThumb,
  normalizeSliderValue,
  type SliderValueConstraints,
} from "../slider-value";

const DECIMAL_CONSTRAINTS: SliderValueConstraints = {
  minimum: -0.2,
  maximum: 1,
  step: 0.1,
};

describe("slider value", () => {
  test("clamps values and aligns decimal steps from the minimum", () => {
    expect(normalizeSliderValue(-2, DECIMAL_CONSTRAINTS)).toBe(-0.2);
    expect(normalizeSliderValue(0.26, DECIMAL_CONSTRAINTS)).toBe(0.3);
    expect(normalizeSliderValue(4, DECIMAL_CONSTRAINTS)).toBe(1);
  });

  test("preserves arbitrary precision when the step is any", () => {
    expect(normalizeSliderValue(0.123_456, {
      minimum: 0,
      maximum: 1,
      step: "any",
    })).toBe(0.123_456);
  });

  test("maps pointer movement relatively without changing the initial sample", () => {
    expect(getSliderValueFromPointerDelta(
      0.4,
      0,
      200,
      { minimum: 0, maximum: 1, step: 0.1 },
    )).toBe(0.4);
    expect(getSliderValueFromPointerDelta(
      0.4,
      40,
      200,
      { minimum: 0, maximum: 1, step: 0.1 },
    )).toBe(0.6);
  });

  test("clamps relative pointer movement at both ends", () => {
    const constraints = { minimum: 0, maximum: 10, step: 1 } as const;

    expect(getSliderValueFromPointerDelta(5, -200, 100, constraints)).toBe(0);
    expect(getSliderValueFromPointerDelta(5, 200, 100, constraints)).toBe(10);
  });

  test("maps track clicks while accounting for the thumb width", () => {
    const constraints = { minimum: 0, maximum: 100, step: 1 } as const;

    expect(getSliderTrackLength(118, 18)).toBe(100);
    expect(getSliderValueFromPointerPosition(
      159,
      100,
      118,
      18,
      constraints,
    )).toBe(50);
    expect(getSliderValueFromPointerPosition(
      90,
      100,
      118,
      18,
      constraints,
    )).toBe(0);
    expect(getSliderValueFromPointerPosition(
      230,
      100,
      118,
      18,
      constraints,
    )).toBe(100);
  });

  test("distinguishes the thumb from the clickable track", () => {
    const constraints = { minimum: 0, maximum: 100, step: 1 } as const;

    expect(isPointerOnSliderThumb(
      159,
      100,
      118,
      18,
      50,
      constraints,
    )).toBe(true);
    expect(isPointerOnSliderThumb(
      130,
      100,
      118,
      18,
      50,
      constraints,
    )).toBe(false);
  });

  test("supports arrows, pages and boundary navigation", () => {
    const constraints = { minimum: 0, maximum: 100, step: 2 } as const;

    expect(getSliderValueFromNavigationKey(50, "ArrowUp", constraints)).toBe(52);
    expect(getSliderValueFromNavigationKey(50, "ArrowLeft", constraints)).toBe(48);
    expect(getSliderValueFromNavigationKey(50, "PageUp", constraints)).toBe(70);
    expect(getSliderValueFromNavigationKey(50, "Home", constraints)).toBe(0);
    expect(getSliderValueFromNavigationKey(50, "End", constraints)).toBe(100);
    expect(getSliderValueFromNavigationKey(50, "Enter", constraints)).toBeNull();
  });

  test("uses one percent keyboard increments for an arbitrary step", () => {
    expect(getSliderValueFromNavigationKey(0.5, "ArrowRight", {
      minimum: 0,
      maximum: 1,
      step: "any",
    })).toBe(0.51);
  });

  test("keeps boundary navigation aligned when the maximum is off-step", () => {
    expect(getSliderValueFromNavigationKey(0.3, "End", {
      minimum: 0,
      maximum: 1,
      step: 0.3,
    })).toBe(0.9);
  });
});
