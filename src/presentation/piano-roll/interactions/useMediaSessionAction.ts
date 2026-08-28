import { useEffect } from "react";

export function useMediaSessionAction(onAction: () => void): void {
  useEffect(() => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", onAction);
      navigator.mediaSession.setActionHandler("pause", onAction);
    }

    return (): void => {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
      }
    };
  }, [onAction]);
}
