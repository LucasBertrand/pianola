export type BrowserErrorSource =
  | "console"
  | "javascript"
  | "promise"
  | "react";

export interface BrowserErrorReport {
  readonly id: string;
  readonly source: BrowserErrorSource;
  readonly message: string;
  readonly details: string;
  readonly occurredAt: number;
}

export interface BrowserErrorQueueSnapshot {
  readonly current: BrowserErrorReport | null;
  readonly pendingCount: number;
}

export interface BrowserErrorCaptureTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface BrowserConsoleTarget {
  error(...values: unknown[]): void;
}

const MAXIMUM_QUEUED_ERRORS = 8;
const MAXIMUM_MESSAGE_LENGTH = 500;
const MAXIMUM_DETAILS_LENGTH = 12_000;
const DUPLICATE_WINDOW_MILLISECONDS = 5_000;

/** Queues actionable browser failures for a UI that may mount afterwards. */
export class BrowserErrorReporter {
  private readonly queue: BrowserErrorReport[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly recentMessages = new Map<string, number>();
  private sequence = 0;
  private snapshot: BrowserErrorQueueSnapshot = {
    current: null,
    pendingCount: 0,
  };

  public readonly getSnapshot = (): BrowserErrorQueueSnapshot => (
    this.snapshot
  );

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return (): void => {
      this.listeners.delete(listener);
    };
  };

  public captureConsoleError(values: readonly unknown[]): void {
    const preferredError = values.find(
      (value): value is Error => value instanceof Error,
    );
    const description = preferredError === undefined
      ? describeValues(values)
      : describeError(preferredError);
    const renderedValues = describeValues(values).details;

    this.enqueue(
      "console",
      description.message,
      renderedValues,
    );
  }

  public captureWindowError(event: ErrorEvent): void {
    const location = formatSourceLocation(
      event.filename,
      event.lineno,
      event.colno,
    );

    if (event.error instanceof Error) {
      const description = describeError(event.error);

      this.enqueue(
        "javascript",
        description.message,
        appendDetails(description.details, location),
      );
      return;
    }

    this.enqueue(
      "javascript",
      event.message || "Unknown JavaScript error",
      location,
    );
  }

  public captureUnhandledRejection(event: PromiseRejectionEvent): void {
    const description = describeValue(event.reason);

    this.enqueue("promise", description.message, description.details);
  }

  public captureReactError(error: Error, componentStack?: string): void {
    const description = describeError(error);

    this.enqueue(
      "react",
      description.message,
      appendDetails(description.details, componentStack?.trim() ?? ""),
    );
  }

  public dismissCurrent(): void {
    if (this.queue.length === 0) {
      return;
    }

    this.queue.shift();
    this.publish();
  }

  private enqueue(
    source: BrowserErrorSource,
    message: string,
    details: string,
  ): void {
    const occurredAt = Date.now();
    const normalizedMessage = truncate(
      message.trim() || "Unknown application error",
      MAXIMUM_MESSAGE_LENGTH,
    );
    const duplicateTimestamp = this.recentMessages.get(normalizedMessage);

    this.pruneRecentMessages(occurredAt);

    if (
      duplicateTimestamp !== undefined
      && occurredAt - duplicateTimestamp < DUPLICATE_WINDOW_MILLISECONDS
    ) {
      return;
    }

    this.recentMessages.set(normalizedMessage, occurredAt);

    if (this.queue.length >= MAXIMUM_QUEUED_ERRORS) {
      return;
    }

    this.sequence += 1;
    this.queue.push({
      id: `browser-error-${occurredAt}-${this.sequence}`,
      source,
      message: normalizedMessage,
      details: truncate(
        details.trim() || normalizedMessage,
        MAXIMUM_DETAILS_LENGTH,
      ),
      occurredAt,
    });
    this.publish();
  }

  private pruneRecentMessages(now: number): void {
    for (const [message, timestamp] of this.recentMessages) {
      if (now - timestamp >= DUPLICATE_WINDOW_MILLISECONDS) {
        this.recentMessages.delete(message);
      }
    }
  }

  private publish(): void {
    this.snapshot = {
      current: this.queue[0] ?? null,
      pendingCount: Math.max(0, this.queue.length - 1),
    };

    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const browserErrorReporter = new BrowserErrorReporter();

/** Keeps native console output while mirroring uncaught failures to the UI. */
export function installBrowserErrorCapture(
  reporter: BrowserErrorReporter = browserErrorReporter,
  target: BrowserErrorCaptureTarget = window,
  consoleTarget: BrowserConsoleTarget = console,
): () => void {
  const originalConsoleError = consoleTarget.error.bind(consoleTarget);
  const interceptedConsoleError = (...values: unknown[]): void => {
    originalConsoleError(...values);
    reporter.captureConsoleError(values);
  };
  const handleWindowError: EventListener = (event): void => {
    reporter.captureWindowError(event as ErrorEvent);
  };
  const handleUnhandledRejection: EventListener = (event): void => {
    reporter.captureUnhandledRejection(event as PromiseRejectionEvent);
  };

  consoleTarget.error = interceptedConsoleError;
  target.addEventListener("error", handleWindowError);
  target.addEventListener("unhandledrejection", handleUnhandledRejection);

  return (): void => {
    target.removeEventListener("error", handleWindowError);
    target.removeEventListener(
      "unhandledrejection",
      handleUnhandledRejection,
    );

    if (consoleTarget.error === interceptedConsoleError) {
      consoleTarget.error = originalConsoleError;
    }
  };
}

function describeValues(values: readonly unknown[]): {
  readonly message: string;
  readonly details: string;
} {
  if (values.length === 0) {
    return {
      message: "console.error was called",
      details: "console.error was called without arguments.",
    };
  }

  const descriptions = values.map(describeValue);

  return {
    message: descriptions.map((description) => description.message).join(" "),
    details: descriptions.map((description) => description.details).join("\n\n"),
  };
}

function describeValue(value: unknown): {
  readonly message: string;
  readonly details: string;
} {
  if (value instanceof Error) {
    return describeError(value);
  }

  if (typeof value === "string") {
    return { message: value, details: value };
  }

  const serialized = serializeValue(value);

  return { message: serialized, details: serialized };
}

function describeError(error: Error): {
  readonly message: string;
  readonly details: string;
} {
  const name = error.name.trim() || "Error";
  const message = error.message.trim();
  const summary = message.length === 0 ? name : `${name}: ${message}`;

  return {
    message: summary,
    details: error.stack?.trim() || summary,
  };
}

function serializeValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  if (typeof value === "bigint") {
    return `${String(value)}n`;
  }

  if (typeof value === "symbol" || typeof value === "function") {
    return String(value);
  }

  try {
    const serialized = JSON.stringify(value, createCircularValueReplacer());

    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

function createCircularValueReplacer(): (
  key: string,
  value: unknown,
) => unknown {
  const seen = new WeakSet<object>();

  return (_key, value): unknown => {
    if (typeof value !== "object" || value === null) {
      return value;
    }

    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    return value;
  };
}

function formatSourceLocation(
  filename: string,
  line: number,
  column: number,
): string {
  if (filename.length === 0) {
    return "";
  }

  return `${filename}:${String(line)}:${String(column)}`;
}

function appendDetails(first: string, second: string): string {
  return second.length === 0 ? first : `${first}\n\n${second}`;
}

function truncate(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) {
    return value;
  }

  return `${value.slice(0, maximumLength - 1)}…`;
}
