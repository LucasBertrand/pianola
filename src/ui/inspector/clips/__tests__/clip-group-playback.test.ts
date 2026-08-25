import {
  describe,
  expect,
  test,
} from "vitest";
import {
  resolveClipGroupPlaybackAction,
} from "../clip-group-playback";

describe("clip group playback action", () => {
  test("starts the first descendant when the group is idle", () => {
    expect(resolveClipGroupPlaybackAction(
      ["clip-a", "clip-b"],
      null,
    )).toEqual({ active: false, targetClipId: "clip-a" });
  });

  test("stays active and stops the descendant currently playing", () => {
    expect(resolveClipGroupPlaybackAction(
      ["clip-a", "clip-b"],
      "clip-b",
    )).toEqual({ active: true, targetClipId: "clip-b" });
  });

  test("does not activate for a clip outside the group", () => {
    expect(resolveClipGroupPlaybackAction(
      ["clip-a", "clip-b"],
      "clip-c",
    )).toEqual({ active: false, targetClipId: "clip-a" });
  });

  test("disables playback for an empty group", () => {
    expect(resolveClipGroupPlaybackAction([], null)).toEqual({
      active: false,
      targetClipId: null,
    });
  });
});
