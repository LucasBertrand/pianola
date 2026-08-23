import {
  describe,
  expect,
  test,
} from "vitest";
import {
  getPlaybackFollowTargetClipId,
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
});
