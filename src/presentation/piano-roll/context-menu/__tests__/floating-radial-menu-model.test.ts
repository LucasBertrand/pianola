import { describe, expect, test } from "vitest";
import {
  getRadialDividerEndPoint,
  getRadialSegmentClipPath,
  getRadialSegmentTransform,
} from "../floating-radial-menu-model";

describe("floating radial menu geometry", () => {
  test("distributes six commands evenly while keeping their labels upright", () => {
    expect(Array.from({ length: 6 }, (_, index) => (
      getRadialSegmentTransform(index, 6)
    ))).toEqual([
      { rotation: "0deg", counterRotation: "0deg" },
      { rotation: "60deg", counterRotation: "-60deg" },
      { rotation: "120deg", counterRotation: "-120deg" },
      { rotation: "180deg", counterRotation: "-180deg" },
      { rotation: "240deg", counterRotation: "-240deg" },
      { rotation: "300deg", counterRotation: "-300deg" },
    ]);
  });

  test("adapts the sector polygon when the command count changes", () => {
    const sixItemSector = getRadialSegmentClipPath(6);
    const fourItemSector = getRadialSegmentClipPath(4);

    expect(sixItemSector).toMatch(/^polygon\(50% 50%,/);
    expect(fourItemSector).toMatch(/^polygon\(50% 50%,/);
    expect(sixItemSector).not.toBe(fourItemSector);
    expect(sixItemSector).toContain("50% 0%");
    expect(fourItemSector).toContain("50% 0%");
  });

  test("places six constant-width dividers on the outer circle", () => {
    const points = Array.from({ length: 6 }, (_, index) => (
      getRadialDividerEndPoint(index, 6)
    ));

    for (const point of points) {
      const distanceFromCenter = Math.hypot(point.x - 50, point.y - 50);

      expect(distanceFromCenter).toBeCloseTo(50);
    }
    expect(points[0]?.x).toBeCloseTo(25);
    expect(points[0]?.y).toBeCloseTo(6.699, 3);
  });

  test("rejects impossible item counts and indices", () => {
    expect(() => getRadialSegmentClipPath(0)).toThrow(RangeError);
    expect(() => getRadialSegmentTransform(-1, 6)).toThrow(RangeError);
    expect(() => getRadialSegmentTransform(6, 6)).toThrow(RangeError);
    expect(() => getRadialDividerEndPoint(6, 6)).toThrow(RangeError);
  });
});
