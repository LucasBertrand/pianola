import type {
  Tick,
} from "../domain/identifiers";
import type {
  PlaybackStatus,
} from "./playback-model";

export interface AudioTransportCallbacks {
  readonly onStatusChange?: (
    status: PlaybackStatus,
    positionTick: Tick,
  ) => void;
  readonly onError?: (error: unknown) => void;
}

export interface SchedulerTimerPort {
  setTimeout(callback: () => void, delayMilliseconds: number): number;
  clearTimeout(handle: number): void;
}

export const DEFAULT_SCHEDULER_TIMER: SchedulerTimerPort = {
  setTimeout(callback, delayMilliseconds) {
    const handle = globalThis.setTimeout(callback, delayMilliseconds);
    return typeof handle === "number" ? handle : Number(handle);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle);
  },
};
