import {
  describe,
  expect,
  test,
} from "vitest";
import {
  BrowserErrorReporter,
  installBrowserErrorCapture,
  type BrowserConsoleTarget,
  type BrowserErrorCaptureTarget,
} from "../../src/ui/diagnostics/browser-error-reporter";

describe("browser error reporter", () => {
  test("queues errors, removes duplicates and advances on dismissal", () => {
    const reporter = new BrowserErrorReporter();
    const firstError = new Error("render failed");

    reporter.captureReactError(firstError, "at BrokenEditor");
    reporter.captureConsoleError(["React failure", firstError]);

    expect(reporter.getSnapshot().current?.message)
      .toBe("Error: render failed");
    expect(reporter.getSnapshot().current?.details)
      .toContain("at BrokenEditor");
    expect(reporter.getSnapshot().pendingCount).toBe(0);

    reporter.captureUnhandledRejection({
      reason: new Error("save failed"),
    } as PromiseRejectionEvent);

    expect(reporter.getSnapshot().pendingCount).toBe(1);

    reporter.dismissCurrent();

    expect(reporter.getSnapshot().current?.source).toBe("promise");
    expect(reporter.getSnapshot().current?.message)
      .toBe("Error: save failed");
  });

  test("mirrors console and global events while preserving native output", () => {
    const reporter = new BrowserErrorReporter();
    const target = new FakeBrowserErrorTarget();
    const nativeConsoleCalls: unknown[][] = [];
    const consoleTarget: BrowserConsoleTarget = {
      error(...values: unknown[]): void {
        nativeConsoleCalls.push(values);
      },
    };
    const uninstall = installBrowserErrorCapture(
      reporter,
      target,
      consoleTarget,
    );

    consoleTarget.error("audio graph failed", { instrumentId: "lead" });

    expect(nativeConsoleCalls).toEqual([
      ["audio graph failed", { instrumentId: "lead" }],
    ]);
    expect(reporter.getSnapshot().current?.source).toBe("console");
    expect(reporter.getSnapshot().current?.details)
      .toContain('"instrumentId":"lead"');

    target.emit("error", {
      message: "timer failed",
      filename: "app.js",
      lineno: 12,
      colno: 8,
      error: null,
    });

    expect(reporter.getSnapshot().pendingCount).toBe(1);
    reporter.dismissCurrent();
    expect(reporter.getSnapshot().current?.details)
      .toBe("app.js:12:8");

    uninstall();
    consoleTarget.error("after uninstall");

    expect(nativeConsoleCalls).toHaveLength(2);
    expect(reporter.getSnapshot().pendingCount).toBe(0);
    expect(target.listenerCount).toBe(0);
  });
});

class FakeBrowserErrorTarget implements BrowserErrorCaptureTarget {
  private readonly listeners = new Map<string, Set<EventListener>>();

  public get listenerCount(): number {
    let count = 0;

    for (const listeners of this.listeners.values()) {
      count += listeners.size;
    }

    return count;
  }

  public addEventListener(type: string, listener: EventListener): void {
    let listeners = this.listeners.get(type);

    if (listeners === undefined) {
      listeners = new Set<EventListener>();
      this.listeners.set(type, listeners);
    }

    listeners.add(listener);
  }

  public removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  public emit(type: string, event: object): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as Event);
    }
  }
}
