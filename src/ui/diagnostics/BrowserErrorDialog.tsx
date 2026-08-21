import React, {
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  BrowserErrorReport,
  BrowserErrorReporter,
  BrowserErrorSource,
} from "./browser-error-reporter";

export interface BrowserErrorDialogProps {
  readonly reporter: BrowserErrorReporter;
}

export function BrowserErrorDialog({
  reporter,
}: BrowserErrorDialogProps): React.JSX.Element | null {
  const snapshot = useSyncExternalStore(
    reporter.subscribe,
    reporter.getSnapshot,
    reporter.getSnapshot,
  );
  const [copyState, setCopyState] = useState<
    "idle" | "copied" | "unavailable"
  >("idle");
  const report = snapshot.current;

  useEffect(() => {
    setCopyState("idle");
  }, [report?.id]);

  if (report === null) {
    return null;
  }

  const copyDetails = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(formatClipboardReport(report));
      setCopyState("copied");
    } catch {
      setCopyState("unavailable");
    }
  };
  const dismissLabel = snapshot.pendingCount === 0
    ? "Close"
    : `Next error (${String(snapshot.pendingCount)})`;

  return (
    <div className="application-dialog-backdrop browser-error-backdrop">
      <section
        className="application-dialog browser-error-dialog"
        data-tone="danger"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="browser-error-dialog-title"
        aria-describedby="browser-error-dialog-message"
      >
        <div className="application-dialog-heading">
          <span className="application-dialog-mark" aria-hidden="true">
            !
          </span>
          <h2 id="browser-error-dialog-title">
            Application error
          </h2>
        </div>
        <p id="browser-error-dialog-message">
          {report.message}
        </p>
        <div className="browser-error-metadata">
          <span>{formatSource(report.source)}</span>
          <time dateTime={new Date(report.occurredAt).toISOString()}>
            {new Date(report.occurredAt).toLocaleString()}
          </time>
        </div>
        <details className="browser-error-details">
          <summary>Technical details</summary>
          <pre>{report.details}</pre>
        </details>
        {copyState === "unavailable"
          ? (
              <p className="browser-error-copy-status" role="status">
                Clipboard access is unavailable. Select the technical details
                manually to copy them.
              </p>
            )
          : null}
        <div className="application-dialog-actions">
          <button
            className="application-dialog-button is-secondary"
            type="button"
            onClick={() => {
              void copyDetails();
            }}
          >
            {copyState === "copied" ? "Copied" : "Copy details"}
          </button>
          <button
            className="application-dialog-button is-primary"
            type="button"
            onClick={() => reporter.dismissCurrent()}
          >
            {dismissLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function formatClipboardReport(report: BrowserErrorReport): string {
  return [
    "Pianola application error",
    `Source: ${formatSource(report.source)}`,
    `Time: ${new Date(report.occurredAt).toISOString()}`,
    `Message: ${report.message}`,
    "",
    report.details,
  ].join("\n");
}

function formatSource(source: BrowserErrorSource): string {
  switch (source) {
    case "console":
      return "Console error";
    case "javascript":
      return "JavaScript error";
    case "promise":
      return "Unhandled promise";
    case "react":
      return "React rendering error";
  }
}
