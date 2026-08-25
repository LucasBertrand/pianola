import { describe, expect, test } from "vitest";
import {
  isStylusButtonActivation,
  isStylusHoverButtonActivation,
} from "../stylus-action-policy";

const BASE_SAMPLE = {
  pointerType: "pen",
  button: 0,
  buttons: 0,
  pressure: 0.5,
};

describe("stylus action policy", () => {
  test.each([1, 2, 5])("accepts pen alternative button %i", (button) => {
    expect(isStylusButtonActivation({ ...BASE_SAMPLE, button })).toBe(true);
  });

  test("does not replace the primary pen tip or mouse buttons", () => {
    expect(isStylusButtonActivation(BASE_SAMPLE)).toBe(false);
    expect(isStylusButtonActivation({
      ...BASE_SAMPLE,
      pointerType: "mouse",
      button: 2,
    })).toBe(false);
  });

  test("recognizes only pressureless pen hover clicks", () => {
    expect(isStylusHoverButtonActivation({
      ...BASE_SAMPLE,
      buttons: 1,
      pressure: 0,
    })).toBe(true);
    expect(isStylusHoverButtonActivation({
      ...BASE_SAMPLE,
      buttons: 1,
      pressure: 0.2,
    })).toBe(false);
    expect(isStylusHoverButtonActivation({
      ...BASE_SAMPLE,
      pointerType: "mouse",
      buttons: 1,
      pressure: 0,
    })).toBe(false);
  });
});
