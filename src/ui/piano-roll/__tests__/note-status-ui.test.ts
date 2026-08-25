import { describe, expect, test } from "vitest";
import {
  getNoteBodyOpacity,
  getNoteContentOpacity,
} from "../rendering/note-opacity";
import { getFrozenToggleStatus } from "../usePianoRollSelectionCommands";

describe("note status UI", () => {
  test("freezes a mixed selection and reactivates an entirely frozen one", () => {
    expect(getFrozenToggleStatus([
      { status: "active" },
      { status: "muted" },
      { status: "locked" },
    ])).toBe("frozen");
    expect(getFrozenToggleStatus([
      { status: "frozen" },
      { status: "frozen" },
    ])).toBe("active");
  });

  test("uses one silent opacity for muted and frozen notes", () => {
    expect(getNoteBodyOpacity({ status: "frozen" }))
      .toBe(getNoteBodyOpacity({ status: "muted" }));
    expect(getNoteContentOpacity({ status: "frozen" }))
      .toBe(getNoteContentOpacity({ status: "muted" }));
    expect(getNoteBodyOpacity({ status: "locked" }))
      .toBe(getNoteBodyOpacity({ status: "active" }));
  });
});
