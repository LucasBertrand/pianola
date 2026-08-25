import {
  describe,
  expect,
  test,
} from "vitest";
import {
  assertValidClipHierarchy,
  getClipPlaybackOrder,
} from "../clip-hierarchy";

describe("clip hierarchy", () => {
  test("flattens nested groups in visible playback order", () => {
    const hierarchy = [{
      kind: "group" as const,
      id: "group-song",
      name: "Song",
      children: [
        { kind: "clip" as const, clipId: "clip-intro" },
        {
          kind: "group" as const,
          id: "group-verse",
          name: "Verse",
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
