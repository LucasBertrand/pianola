import type {
  PresetId,
} from "../../../domain/identifiers";

/** Browser/session adapter. Domain preset operations receive the resulting ID. */
export function createBrowserPersonalPresetId(): PresetId {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `personal-preset-${globalThis.crypto.randomUUID()}`;
  }

  return `personal-preset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
