import {
  describe,
  expect,
  test,
} from "vitest";
import {
  getPlaybackFollowTargetClipId,
  resolvePlaybackFollowClipSelection,
  shouldReturnViewportToStart,
} from "../playback-follow-policy";

describe("playback follow policy", () => {
  test("does not take over clip selection while disabled", () => {
    expect(getPlaybackFollowTargetClipId(
      false,
      "playing",
      "clip-editing",
      "clip-playing",
    )).toBeNull();
  });

  test("reveals a background playing clip while enabled", () => {
    expect(getPlaybackFollowTargetClipId(
      true,
      "playing",
      "clip-editing",
      "clip-playing",
    )).toBe("clip-playing");
  });

  test("does not navigate while playback is paused", () => {
    expect(getPlaybackFollowTargetClipId(
      true,
      "paused",
      "clip-editing",
      "clip-playing",
    )).toBeNull();
  });

  test("rejects a transient clip selection while following playback", () => {
    expect(resolvePlaybackFollowClipSelection(
      true,
      "playing",
      "clip-requested",
      "clip-playing",
    )).toBe("clip-playing");
  });

  test("allows clip selection while playback following is inactive", () => {
    expect(resolvePlaybackFollowClipSelection(
      false,
      "playing",
      "clip-requested",
      "clip-playing",
    )).toBe("clip-requested");
    expect(resolvePlaybackFollowClipSelection(
      true,
      "paused",
      "clip-requested",
      "clip-playing",
    )).toBe("clip-requested");
  });

  test("moves the viewport on Return to start only while follow is enabled", () => {
    expect(shouldReturnViewportToStart(
      false,
      "clip-active",
      null,
    )).toBe(false);
    expect(shouldReturnViewportToStart(
      true,
      "clip-active",
      null,
    )).toBe(true);
    expect(shouldReturnViewportToStart(
      true,
      "clip-active",
      "clip-playing",
    )).toBe(false);
  });
});
