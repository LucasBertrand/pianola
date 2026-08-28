import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  createTestProject,
} from "../../../../tests/support/test-builders";
import { ClipSplitDialog } from "../ClipSplitDialog";

describe("ClipSplitDialog", () => {
  test("shows the generated clip count before confirmation", () => {
    const project = createTestProject({
      clips: [{ id: "clip-source", measureCount: 3 }],
    });
    const clip = project.clipsById["clip-source"]!;

    const markup = renderToStaticMarkup(createElement(ClipSplitDialog, {
      clip,
      clock: project.clock,
      projectClipCount: 1,
      canCreateGroup: true,
      onConfirm: () => undefined,
      onCancel: () => undefined,
    }));

    expect(markup).toContain("3 clips will be generated.");
    expect(markup).toContain("Individual measures");
    expect(markup).toContain("Section markers");
  });
});
