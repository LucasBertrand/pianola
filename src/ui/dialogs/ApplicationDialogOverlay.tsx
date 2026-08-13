import React from "react";
import type {
  ApplicationDialogState,
} from "../../use-cases/dialogs/application-dialog-port";

export interface ApplicationDialogOverlayProps {
  readonly dialog: ApplicationDialogState | null;
  readonly onConfirm: () => void;
  readonly onAlternate: () => void;
  readonly onCancel: () => void;
}

export function ApplicationDialogOverlay(
  props: ApplicationDialogOverlayProps,
): React.JSX.Element | null {
  const {
    dialog,
    onConfirm,
    onAlternate,
    onCancel,
  } = props;

  if (dialog === null) {
    return null;
  }

  return (
    <div className="application-dialog-backdrop">
      <section
        className="application-dialog"
        data-tone={dialog.tone}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="application-dialog-title"
        aria-describedby="application-dialog-message"
      >
        <div className="application-dialog-heading">
          <span className="application-dialog-mark" aria-hidden="true">
            {dialog.tone === "danger" ? "!" : "i"}
          </span>
          <h2 id="application-dialog-title">
            {dialog.title}
          </h2>
        </div>
        <p id="application-dialog-message">
          {dialog.message}
        </p>
        {dialog.details === undefined
          || dialog.details.length === 0
          ? null
          : (
              <ul className="application-dialog-details">
                {dialog.details.map((detail, index) => (
                  <li key={`${String(index)}-${detail}`}>
                    {detail}
                  </li>
                ))}
              </ul>
            )}
        <div
          className={
            dialog.alternateLabel === null
              ? "application-dialog-actions"
              : "application-dialog-actions has-alternate"
          }
        >
          {dialog.cancelLabel === null
            ? null
            : (
                <button
                  className="application-dialog-button is-secondary"
                  type="button"
                  onClick={onCancel}
                >
                  {dialog.cancelLabel}
                </button>
              )}
          {dialog.alternateLabel === null
            ? null
            : (
                <button
                  className="application-dialog-button is-secondary"
                  type="button"
                  onClick={onAlternate}
                >
                  {dialog.alternateLabel}
                </button>
              )}
          <button
            className="application-dialog-button is-primary"
            type="button"
            onClick={onConfirm}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
