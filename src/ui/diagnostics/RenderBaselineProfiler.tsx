import React, {
  Fragment,
  Profiler,
  type ProfilerOnRenderCallback,
  type ReactNode,
} from "react";

interface RenderProfileMetrics {
  commits: number;
  actualDurationMs: number;
  mountCommits: number;
  updateCommits: number;
}

interface RenderBaselineSnapshot {
  readonly startedAt: number;
  readonly endedAt: number;
  readonly elapsedMs: number;
  readonly profiles: Readonly<Record<string, RenderProfileMetrics>>;
  readonly longTasks: {
    readonly count: number;
    readonly totalDurationMs: number;
    readonly maximumDurationMs: number;
  };
  readonly unchangedSelectorNotifications: 0;
}

interface RenderBaselineControl {
  reset(): void;
  snapshot(): RenderBaselineSnapshot;
}

declare global {
  interface Window {
    __PIANOLA_RENDER_BASELINE__?: RenderBaselineControl;
  }
}

const enabled = typeof window !== "undefined"
  && new URLSearchParams(window.location.search).get("renderBaseline") === "1";
let startedAt = 0;
let profiles: Record<string, RenderProfileMetrics> = {};
let longTaskDurations: number[] = [];
let observerInstalled = false;

const recordRender: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
) => {
  const current = profiles[id] ?? {
    commits: 0,
    actualDurationMs: 0,
    mountCommits: 0,
    updateCommits: 0,
  };

  current.commits += 1;
  current.actualDurationMs += actualDuration;

  if (phase === "mount") {
    current.mountCommits += 1;
  } else {
    current.updateCommits += 1;
  }

  profiles[id] = current;
};

export interface RenderBaselineProfilerProps {
  readonly id: string;
  readonly children: ReactNode;
}

/** Opt-in React profiler used only by the reproducible migration baseline. */
export function RenderBaselineProfiler({
  id,
  children,
}: RenderBaselineProfilerProps): React.JSX.Element {
  if (!enabled) {
    return <Fragment>{children}</Fragment>;
  }

  installRenderBaselineControl();

  return (
    <Profiler id={id} onRender={recordRender}>
      {children}
    </Profiler>
  );
}

function installRenderBaselineControl(): void {
  if (window.__PIANOLA_RENDER_BASELINE__ === undefined) {
    window.__PIANOLA_RENDER_BASELINE__ = {
      reset: resetMetrics,
      snapshot: snapshotMetrics,
    };
    resetMetrics();
  }

  if (observerInstalled || typeof PerformanceObserver === "undefined") {
    return;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.startTime >= startedAt) {
          longTaskDurations.push(entry.duration);
        }
      }
    });

    observer.observe({ entryTypes: ["longtask"] });
    observerInstalled = true;
  } catch {
    // A browser without the Long Tasks API still reports React commit counts.
  }
}

function resetMetrics(): void {
  startedAt = performance.now();
  profiles = {};
  longTaskDurations = [];
}

function snapshotMetrics(): RenderBaselineSnapshot {
  const endedAt = performance.now();

  return {
    startedAt,
    endedAt,
    elapsedMs: endedAt - startedAt,
    profiles: Object.fromEntries(
      Object.entries(profiles).map(([id, profile]) => [id, { ...profile }]),
    ),
    longTasks: {
      count: longTaskDurations.length,
      totalDurationMs: longTaskDurations.reduce(
        (total, duration) => total + duration,
        0,
      ),
      maximumDurationMs: Math.max(0, ...longTaskDurations),
    },
    // useSyncExternalStore selectors do not exist before lot 5.
    unchangedSelectorNotifications: 0,
  };
}
