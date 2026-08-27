import {
  useCallback,
  useEffect,
  useState,
  type RefObject,
} from "react";
import type {
  InstrumentId,
} from "../../domain/identifiers";
import type {
  EditorSessionState,
} from "../../domain/project/project-document";
import type {
  EditorRuntime,
} from "../../editor/runtime/editor-runtime";
import type {
  Note,
} from "../../domain/notes/note";
import type {
  PianoRollControllerPort,
} from "../../editor/interactions/piano-roll-controller-port";

export interface PianoRollProjectState {
  readonly project: EditorSessionState;
  readonly selectedInstrumentId: InstrumentId | null;
  readonly selectionAvailable: boolean;
  readonly selectedNotes: readonly Note[];
  readonly selectedMarkerCount: number;
  readonly selectInstrument: (instrumentId: InstrumentId | null) => void;
  readonly setSelectionAvailable: (available: boolean) => void;
  readonly handleSelectionChange: (
    hasSelection: boolean,
    soleInstrumentId: InstrumentId | null,
  ) => void;
  readonly clearInteractionSelection: () => void;
}

/** Keeps project, active instrument and note selection coherent across clips. */
export function usePianoRollProjectState(
  runtime: EditorRuntime,
  controllerRef: RefObject<PianoRollControllerPort | null>,
): PianoRollProjectState {
  const [project, setProject] = useState(
    () => runtime.projectStore.getState(),
  );
  const [selectedInstrumentId, selectInstrument] =
    useState<InstrumentId | null>(
      () => runtime.projectStore.getState().instrumentOrder[0] ?? null,
    );
  const [selectionAvailable, setSelectionAvailable] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<readonly Note[]>([]);
  const [selectedMarkerCount, setSelectedMarkerCount] = useState(0);
  const clearInteractionSelection = useCallback((): void => {
    const controller = controllerRef.current;

    controller?.cancel();
    controller?.clearSelection();
    runtime.selectionRequests.clear();
    setSelectionAvailable(false);
    setSelectedNotes([]);
    setSelectedMarkerCount(0);
  }, [controllerRef, runtime]);
  const handleSelectionChange = useCallback((
    hasSelection: boolean,
    soleInstrumentId: InstrumentId | null,
  ): void => {
    setSelectionAvailable(hasSelection);
    setSelectedNotes(controllerRef.current?.getSelectedNotes() ?? []);
    setSelectedMarkerCount(runtime.selection.markerGroupCount);

    if (soleInstrumentId !== null) {
      selectInstrument(soleInstrumentId);
    }
  }, [controllerRef, runtime]);

  useEffect(
    () => runtime.projectStore.subscribe((state, previousState) => {
      if (state.workspace.activeClipId !== previousState.workspace.activeClipId) {
        clearInteractionSelection();
      }

      setProject(state);
      selectInstrument((currentInstrumentId) => {
        if (
          currentInstrumentId !== null
          && state.projectInstrumentsById[currentInstrumentId] !== undefined
        ) {
          return currentInstrumentId;
        }

        return state.instrumentOrder[0] ?? null;
      });
    }),
    [clearInteractionSelection, runtime],
  );

  return {
    project,
    selectedInstrumentId,
    selectionAvailable,
    selectedNotes,
    selectedMarkerCount,
    selectInstrument,
    setSelectionAvailable,
    handleSelectionChange,
    clearInteractionSelection,
  };
}
