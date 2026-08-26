import { describe, expect, test } from "vitest";
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


});
