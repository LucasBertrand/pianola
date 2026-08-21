import { useMemo } from "react";
import { useStylusAction } from "./useStylusAction";
import { useMediaSessionAction } from "./useMediaSessionAction";
import { useKeyboardShortcut } from "./useKeyboardShortcut";

export function usePrimaryActionTrigger(onAction: () => void): void {
  const keyboardCodes = useMemo(
    () => ["Space", "MediaPlayPause", "MediaPlay", "MediaPause"],
    [],
  );

  useStylusAction(onAction);
  useMediaSessionAction(onAction);
  useKeyboardShortcut(keyboardCodes, onAction);
}
