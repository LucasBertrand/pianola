import { describe, expect, test } from "vitest";
import { getMuteToggleValue } from "../usePianoRollSelectionCommands";

describe("note mute UI", () => {
  test("mutes a mixed selection and unmutes an entirely muted one", () => {
    expect(getMuteToggleValue([
      { muted: false },
      { muted: true },
      { muted: false },
    ])).toBe(true);
    expect(getMuteToggleValue([
      { muted: true },
      { muted: true },
    ])).toBe(false);
  });


});
