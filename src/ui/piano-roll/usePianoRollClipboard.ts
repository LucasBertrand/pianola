import {
  useCallback,
  useRef,
  useState,
} from "react";
import type {
  PianoRollControllerPort,
} from "../../editor/interactions/piano-roll-controller-port";
import type {
  PianoRollClipboard,
} from "../../use-cases/piano-roll/selection/selection-edit-plans";

export interface PianoRollClipboardWorkflow {
  readonly available: boolean;
  readonly get: () => PianoRollClipboard | null;
  readonly copySelection: () => PianoRollClipboard | null;
  readonly copy: () => void;
  readonly clear: () => void;
}

/** Owns the transient note clipboard and its availability signal. */
export function usePianoRollClipboard(
  getController: () => PianoRollControllerPort | null,
): PianoRollClipboardWorkflow {
  const clipboardRef = useRef<PianoRollClipboard | null>(null);
  const [available, setAvailable] = useState(false);
  const get = useCallback((): PianoRollClipboard | null => (
    clipboardRef.current
  ), []);
  const clear = useCallback((): void => {
    clipboardRef.current = null;
    setAvailable(false);
  }, []);
  const copySelection = useCallback((): PianoRollClipboard | null => {
    const notes = getController()?.getSelectedNotes() ?? [];

    if (notes.length === 0) {
      return null;
    }

    let originTick = Number.POSITIVE_INFINITY;

    for (const note of notes) {
      originTick = Math.min(originTick, note.startTick);
    }

    if (!Number.isFinite(originTick)) {
      return null;
    }

    const clipboard: PianoRollClipboard = {
      notes,
      originTick,
    };

    clipboardRef.current = clipboard;
    setAvailable(true);
    return clipboard;
  }, [getController]);
  const copy = useCallback((): void => {
    copySelection();
  }, [copySelection]);

  return {
    available,
    get,
    copySelection,
    copy,
    clear,
  };
}
