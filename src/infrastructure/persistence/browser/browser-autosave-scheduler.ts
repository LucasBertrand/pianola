import type {
  AutosaveScheduler,
} from "../../../application/ports/autosave-scheduler";

export const BROWSER_AUTOSAVE_SCHEDULER: AutosaveScheduler = {
  schedule(callback, delayMilliseconds) {
    return window.setTimeout(callback, delayMilliseconds);
  },
  cancel(handle) {
    window.clearTimeout(handle as number);
  },
};
