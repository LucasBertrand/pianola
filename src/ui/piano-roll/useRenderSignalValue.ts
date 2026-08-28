import {
  useCallback,
  useSyncExternalStore,
} from "react";
import type {
  ReadonlyRenderSignal,
} from "../../editor/model/render-signal";

export function useRenderSignalValue<T>(
  signal: ReadonlyRenderSignal<T>,
): T {
  const subscribe = useCallback(
    (listener: () => void) => signal.subscribe(listener),
    [signal],
  );
  const getSnapshot = useCallback(() => signal.get(), [signal]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
