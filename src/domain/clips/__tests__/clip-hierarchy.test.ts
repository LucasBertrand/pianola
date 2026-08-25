import {
  describe,
  expect,
  test,
} from "vitest";
import {
  assertValidClipHierarchy,
  countDescendantClips,
  findClipHierarchyNodeLocation,
  getFirstDescendantClipId,
  getClipGroupChildren,
  getClipPlaybackOrder,
} from "../clip-hierarchy";

describe("clip hierarchy", () => {
  test("flattens nested groups in visible playback order", () => {
    const hierarchy = [{
      kind: "group" as const,
      id: "group-song",
      name: "Song",
      color: "#79a7ff",
      children: [
        { kind: "clip" as const, clipId: "clip-intro" },
        {
          kind: "group" as const,
          id: "group-verse",
          name: "Verse",
          color: "#a77bf3",
          children: [
            { kind: "clip" as const, clipId: "clip-verse-a" },
            { kind: "clip" as const, clipId: "clip-verse-b" },
          ],
        },
      ],
    }];

    expect(getClipPlaybackOrder(hierarchy)).toEqual([
      "clip-intro",
      "clip-verse-a",
      "clip-verse-b",
    ]);
    expect(() => assertValidClipHierarchy(hierarchy, new Set([
      "clip-intro",
      "clip-verse-a",
      "clip-verse-b",
    ]))).not.toThrow();
    expect(findClipHierarchyNodeLocation(
      hierarchy,
      { kind: "clip", clipId: "clip-verse-b" },
    )).toEqual({ parentGroupId: "group-verse", index: 1 });
    expect(getClipGroupChildren(hierarchy, "group-verse")).toHaveLength(2);
    expect(countDescendantClips(hierarchy[0]!)).toBe(3);
    expect(getFirstDescendantClipId(hierarchy[0]!)).toBe("clip-intro");
    expect(getFirstDescendantClipId(hierarchy[0]!.children[1]!))
      .toBe("clip-verse-a");
    expect(getFirstDescendantClipId({
      kind: "group",
      id: "group-empty",
      name: "Empty",
      color: "#79a7ff",
      children: [],
    })).toBeNull();
  });

  test("rejects a duplicate leaf clip", () => {
    const hierarchy = [
      { kind: "clip" as const, clipId: "clip-a" },
      { kind: "clip" as const, clipId: "clip-a" },
    ];

    expect(() => assertValidClipHierarchy(hierarchy, new Set(["clip-a"])))
      .toThrow("invalid or duplicate clip ID");
  });

  test("requires at least one clip", () => {
    expect(() => assertValidClipHierarchy([], new Set()))
      .toThrow("at least one clip");
  });
});
