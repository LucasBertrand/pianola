import { describe, expect, test } from "vitest";
import {
  getPianoRollWorkspaceClassName,
} from "../PianoRollWorkspaceLayout";

describe("piano-roll workspace layout", () => {
  test("keeps the closed workspace class stable", () => {
    expect(getPianoRollWorkspaceClassName(false, "instruments"))
      .toBe("workspace");
  });

  test("marks the open instruments and clips layouts independently", () => {
    expect(getPianoRollWorkspaceClassName(true, "instruments"))
      .toBe("workspace is-project-inspector-open");
    expect(getPianoRollWorkspaceClassName(true, "clips"))
      .toBe("workspace is-project-inspector-open is-clips-inspector-open");
  });
});
