import {
  describe,
  expect,
  test,
} from "vitest";
import {
  calculateLandscapeInspectorBounds,
  resolveProjectInspectorResizeOrientation,
  resizeProjectInspectorFromKey,
  resizeProjectInspectorFromPointer,
} from "../project-inspector-resize";

const BOUNDS = { minimum: 200, maximum: 500 } as const;

describe("project inspector resizing", () => {
  test("uses portrait resizing only for the compact portrait layout", () => {
    expect(resolveProjectInspectorResizeOrientation(true, true)).toBe("portrait");
    expect(resolveProjectInspectorResizeOrientation(false, true)).toBe("landscape");
    expect(resolveProjectInspectorResizeOrientation(true, false)).toBe("landscape");
  });

  test("uses all landscape space beyond the editor minimum", () => {
    expect(calculateLandscapeInspectorBounds(1_200, 400, 360, 10))
      .toEqual({ minimum: 400, maximum: 830 });
    expect(calculateLandscapeInspectorBounds(700, 400, 360, 10))
      .toEqual({ minimum: 400, maximum: 400 });
  });

  test("resizes a landscape inspector opposite to horizontal pointer movement", () => {
    expect(resizeProjectInspectorFromPointer("landscape", 300, -40, BOUNDS))
      .toBe(340);
    expect(resizeProjectInspectorFromPointer("landscape", 300, 40, BOUNDS))
      .toBe(260);
  });

  test("resizes a portrait inspector with vertical pointer movement", () => {
    expect(resizeProjectInspectorFromPointer("portrait", 240, 35, BOUNDS))
      .toBe(275);
  });

  test("clamps pointer resizing to the available bounds", () => {
    expect(resizeProjectInspectorFromPointer("landscape", 300, -500, BOUNDS))
      .toBe(500);
    expect(resizeProjectInspectorFromPointer("portrait", 300, -500, BOUNDS))
      .toBe(200);
  });

  test("supports orientation-aware arrow keys and boundary keys", () => {
    expect(resizeProjectInspectorFromKey("landscape", 300, "ArrowLeft", 16, BOUNDS))
      .toBe(316);
    expect(resizeProjectInspectorFromKey("portrait", 300, "ArrowUp", 16, BOUNDS))
      .toBe(284);
    expect(resizeProjectInspectorFromKey("portrait", 300, "Home", 16, BOUNDS))
      .toBe(200);
    expect(resizeProjectInspectorFromKey("portrait", 300, "End", 16, BOUNDS))
      .toBe(500);
    expect(resizeProjectInspectorFromKey("portrait", 300, "ArrowLeft", 16, BOUNDS))
      .toBeNull();
  });
});
