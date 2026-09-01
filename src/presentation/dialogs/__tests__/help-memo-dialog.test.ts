import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  HelpMemoDialog,
} from "../HelpMemoDialog";

describe("HelpMemoDialog", () => {
  test("lists toolbar commands by category with icons and essential concepts", () => {
    const markup = renderToStaticMarkup(createElement(HelpMemoDialog, {
      onClose: () => undefined,
    }));

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Project and timeline");
    expect(markup).toContain("Selection and clipboard");
    expect(markup).toContain("Musical transformations");
    expect(markup).toContain("Transport");
    expect(markup).toContain("Grid and viewport");
    expect(markup).toContain("Pitch guide");
    expect(markup).toContain("Note colors");
    expect(markup.match(/help-memo-command-icon/g)?.length).toBeGreaterThan(20);
    expect(markup).toContain('d="M5 4v8a7 7 0 0 0 14 0V4"');
    expect(markup).toContain('class="is-note-color-brush"');
    expect(markup).toContain('viewBox="0 0 16 16"');
  });
});
