import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  ApplicationDialogOverlay,
} from "../ApplicationDialogOverlay";

describe("ApplicationDialogOverlay", () => {
  test("uses the priority backdrop above feature dialogs", () => {
    const markup = renderToStaticMarkup(createElement(
      ApplicationDialogOverlay,
      {
        dialog: {
          title: "Failure",
          message: "The operation failed.",
          confirmLabel: "OK",
          alternateLabel: null,
          cancelLabel: null,
          tone: "danger",
          onConfirm: null,
          onAlternate: null,
        },
        onConfirm: () => undefined,
        onAlternate: () => undefined,
        onCancel: () => undefined,
      },
    ));

    expect(markup).toContain(
      'class="application-dialog-backdrop application-dialog-overlay-backdrop"',
    );
  });
});
