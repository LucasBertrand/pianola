import type {
  AutosaveScheduler,
} from "../../use-cases/persistence/project-autosave";

export const BROWSER_AUTOSAVE_SCHEDULER: AutosaveScheduler = {
  schedule(callback, delayMilliseconds) {
    return window.setTimeout(callback, delayMilliseconds);
  },
  cancel(handle) {
    window.clearTimeout(handle as number);
  },
};
