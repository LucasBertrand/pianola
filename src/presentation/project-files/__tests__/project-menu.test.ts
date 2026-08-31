import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  ProjectMenu,
} from "../ProjectMenu";

describe("ProjectMenu", () => {
  test("offers the editor memo from the navigation group", () => {
    const markup = renderToStaticMarkup(createElement(ProjectMenu, {
      projectTitle: "Test project",
      midiInputRef: createRef<HTMLInputElement>(),
      onReturnHome: () => undefined,
      onExportProject: () => undefined,
      onOpenMidiImport: () => undefined,
      onExportMidi: () => undefined,
      onMidiFileChange: () => undefined,
      onProjectTitleCommit: () => undefined,
    }));

    expect(markup).toContain("Editor memo");
    expect(markup).toContain("Commands and essential concepts");
  });
});
