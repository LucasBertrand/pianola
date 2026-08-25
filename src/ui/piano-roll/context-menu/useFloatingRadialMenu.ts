import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  ViewportPoint,
} from "./floating-radial-menu-model";

const CLOSE_ANIMATION_DURATION_MS = 160;

export interface FloatingRadialMenuState {
  readonly position: ViewportPoint;
  readonly revision: number;
  readonly closing: boolean;
}

export interface FloatingRadialMenuController {
  readonly state: FloatingRadialMenuState | null;
  readonly openAt: (position: ViewportPoint) => void;
  readonly close: () => void;
  readonly toggleAt: (position: ViewportPoint) => void;
}

/** Owns menu placement plus an exit phase long enough for the close motion. */
export function useFloatingRadialMenu(): FloatingRadialMenuController {
  const [state, setState] = useState<FloatingRadialMenuState | null>(null);
  const stateRef = useRef<FloatingRadialMenuState | null>(null);
  const revisionRef = useRef(0);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback((): void => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openAt = useCallback((position: ViewportPoint): void => {
    clearCloseTimer();
    revisionRef.current += 1;
    const nextState = {
      position,
      revision: revisionRef.current,
      closing: false,
    };

    stateRef.current = nextState;
    setState(nextState);
  }, [clearCloseTimer]);

  const close = useCallback((): void => {
    const current = stateRef.current;

    if (current === null || current.closing) {
      return;
    }

    const closingState = { ...current, closing: true };

    stateRef.current = closingState;
    setState(closingState);
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      stateRef.current = null;
      setState(null);
    }, CLOSE_ANIMATION_DURATION_MS);
  }, [clearCloseTimer]);

  const toggleAt = useCallback((position: ViewportPoint): void => {
    if (stateRef.current !== null && !stateRef.current.closing) {
      close();
      return;
    }

    openAt(position);
  }, [close, openAt]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  return { state, openAt, close, toggleAt };
}
