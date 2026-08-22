import {
  useCallback,
  useRef,
  useState,
} from "react";
import type {
  EditorCommandPort,
} from "../../use-cases/commands/editor-command-service";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import type {
  EditorSelection,
} from "../../editor/selection/editor-selection";
import type {
  PianoRollClipboard,
} from "../../use-cases/piano-roll/selection/selection-edit-plans";
import {
  createPianoRollClipboard,
} from "../../use-cases/piano-roll/selection/selection-edit-plans";

export interface PianoRollClipboardWorkflow {
  readonly available: boolean;
  readonly get: () => PianoRollClipboard | null;
  readonly copySelection: () => PianoRollClipboard | null;
  readonly copy: () => void;
  readonly clear: () => void;
}

/** Owns the transient mixed note/marker clipboard and its availability. */
export function usePianoRollClipboard(
  commands: EditorCommandPort,
  selection: EditorSelection,
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
    const activeClip = getActiveClip(commands.getState());
    const clipboard = createPianoRollClipboard(
      selection.copyNotes(),
      selection.markerGroups,
      activeClip.timeline.timeMap,
    );

    if (clipboard === null) {
      return null;
    }

    clipboardRef.current = clipboard;
    setAvailable(true);
    return clipboard;
  }, [commands, selection]);
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
