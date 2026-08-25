import { describe, expect, test } from "vitest";
import {
  getNoteBodyOpacity,
  getNoteContentOpacity,
} from "../rendering/note-opacity";
import { getDisabledToggleStatus } from "../usePianoRollSelectionCommands";

describe("note status UI", () => {
  test("disables a mixed selection and reactivates an entirely disabled one", () => {
    expect(getDisabledToggleStatus([
      { status: "active" },
      { status: "muted" },
      { status: "locked" },
    ])).toBe("disabled");
    expect(getDisabledToggleStatus([
      { status: "disabled" },
      { status: "disabled" },
    ])).toBe("active");
  });

  test("uses one silent opacity for muted and disabled notes", () => {
    expect(getNoteBodyOpacity({ status: "disabled" }))
      .toBe(getNoteBodyOpacity({ status: "muted" }));
    expect(getNoteContentOpacity({ status: "disabled" }))
      .toBe(getNoteContentOpacity({ status: "muted" }));
    expect(getNoteBodyOpacity({ status: "locked" }))
      .toBe(getNoteBodyOpacity({ status: "active" }));
  });
});
