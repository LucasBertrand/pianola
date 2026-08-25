import {
  describe,
  expect,
  test,
} from "vitest";
import {
  normalizeDropTarget,
} from "../useClipHierarchyReorder";

describe("clip hierarchy drag targets", () => {
  test("accounts for source removal when moving later among the same siblings", () => {
    expect(normalizeDropTarget(null, 0, null, 3)).toEqual({
      parentGroupId: null,
      index: 2,
    });
  });

  test("keeps the DOM insertion index when moving earlier", () => {
    expect(normalizeDropTarget("group-a", 3, "group-a", 1)).toEqual({
      parentGroupId: "group-a",
      index: 1,
    });
  });

  test("accounts for source removal when dropping at the end of its parent", () => {
    expect(normalizeDropTarget("group-a", 1, "group-a", 4)).toEqual({
      parentGroupId: "group-a",
      index: 3,
    });
  });

  test("does not adjust an insertion into another parent", () => {
    expect(normalizeDropTarget("group-a", 1, "group-b", 4)).toEqual({
      parentGroupId: "group-b",
      index: 4,
    });
  });
});
