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
  ProjectState,
} from "../../domain/project/project-document";
import type {
  EditorRuntime,
} from "../../editor/runtime/editor-runtime";
import type {
  PianoRollControllerPort,
} from "../../editor/interactions/piano-roll-controller-port";

export interface PianoRollProjectState {
  readonly project: ProjectState;
  readonly selectedInstrumentId: InstrumentId | null;
  readonly selectionAvailable: boolean;
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
  const clearInteractionSelection = useCallback((): void => {
    const controller = controllerRef.current;

    controller?.cancel();
    controller?.clearSelection();
    runtime.selectionRequests.clear();
    setSelectionAvailable(false);
  }, [controllerRef, runtime]);
  const handleSelectionChange = useCallback((
    hasSelection: boolean,
    soleInstrumentId: InstrumentId | null,
  ): void => {
    setSelectionAvailable(hasSelection);

    if (soleInstrumentId !== null) {
      selectInstrument(soleInstrumentId);
    }
  }, []);

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
    selectInstrument,
    setSelectionAvailable,
    handleSelectionChange,
    clearInteractionSelection,
  };
}
