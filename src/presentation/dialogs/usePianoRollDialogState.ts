import {
  useCallback,
  useState,
} from "react";
import type {
  ClipId,
} from "../../domain/identifiers";
import type {
  MeasureDialogOperation,
} from "./piano-roll-dialog-model";

export interface PianoRollDialogState {
  readonly measureOperation: MeasureDialogOperation | null;
  readonly splitClipId: ClipId | null;
  readonly openMeasure: (operation: MeasureDialogOperation) => void;
  readonly closeMeasure: () => void;
  readonly openSplit: (clipId: ClipId) => void;
  readonly closeSplit: () => void;
}

/** Owns the open/closed identity of transient workspace dialogs. */
export function usePianoRollDialogState(): PianoRollDialogState {
  const [measureOperation, setMeasureOperation] =
    useState<MeasureDialogOperation | null>(null);
  const [splitClipId, setSplitClipId] = useState<ClipId | null>(null);
  const closeMeasure = useCallback((): void => setMeasureOperation(null), []);
  const closeSplit = useCallback((): void => setSplitClipId(null), []);

  return {
    measureOperation,
    splitClipId,
    openMeasure: setMeasureOperation,
    closeMeasure,
    openSplit: setSplitClipId,
    closeSplit,
  };
}
