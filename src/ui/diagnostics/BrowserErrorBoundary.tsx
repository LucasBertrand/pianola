import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";
import type {
  BrowserErrorReporter,
} from "./browser-error-reporter";

export interface BrowserErrorBoundaryProps {
  readonly reporter: BrowserErrorReporter;
  readonly children: ReactNode;
}

interface BrowserErrorBoundaryState {
  readonly failed: boolean;
}

/** Keeps the global diagnostic dialog alive when the editor tree crashes. */
export class BrowserErrorBoundary extends Component<
  BrowserErrorBoundaryProps,
  BrowserErrorBoundaryState
> {
  public override state: BrowserErrorBoundaryState = { failed: false };

  public static getDerivedStateFromError(): BrowserErrorBoundaryState {
    return { failed: true };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.reporter.captureReactError(error, info.componentStack ?? "");
  }

  public override render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <main className="fatal-error-fallback" role="alert">
        <h1>The editor could not continue</h1>
        <p>
          Review or copy the error details, then reload the application.
        </p>
        <button
          className="application-dialog-button is-primary"
          type="button"
          onClick={() => window.location.reload()}
        >
          Reload application
        </button>
      </main>
    );
  }
}
