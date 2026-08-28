import { useMemo } from "react";
import { useMediaSessionAction } from "./useMediaSessionAction";
import { useKeyboardShortcut } from "./useKeyboardShortcut";
import type {
  ShortcutBinding,
} from "../../../application/ports/user-settings-repository";

export function usePrimaryActionTrigger(
  onAction: () => void,
  configuredBinding: ShortcutBinding,
): void {
  const bindings = useMemo(
    () => [
      configuredBinding,
      createUnmodifiedBinding("MediaPlayPause"),
      createUnmodifiedBinding("MediaPlay"),
      createUnmodifiedBinding("MediaPause"),
    ],
    [configuredBinding],
  );

  useMediaSessionAction(onAction);
  useKeyboardShortcut(bindings, onAction);
}

function createUnmodifiedBinding(code: string): ShortcutBinding {
  return {
    code,
    control: false,
    shift: false,
    alt: false,
    meta: false,
  };
}
