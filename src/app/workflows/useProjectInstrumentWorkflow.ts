import {
  useCallback,
  useRef,
} from "react";
import type {
  EditorCommandPort,
} from "../../application/editor-command-service";
import type {
  UpdateProjectInstrumentChanges,
} from "../../domain/commands";
import {
  getActiveClip,
  type ClipId,
  type InstrumentConfig,
  type ProjectInstrument,
  type InstrumentId,
  type ClipInstrumentState,
} from "../../domain/model";
import {
  createDefaultClipInstrumentState,
  createDefaultProjectInstrument,
} from "../../domain/project-instrument-factory";
import type {
  ShowApplicationConfirmation,
} from "./dialog-types";

export interface ProjectInstrumentWorkflowOptions {
  readonly commands: EditorCommandPort;
  readonly selectedInstrumentId: InstrumentId | null;
  readonly selectInstrument: (instrumentId: InstrumentId | null) => void;
  readonly toggleInstrumentSelection: (instrumentId: InstrumentId) => void;
  readonly removeInstrumentFromSelection: (instrumentId: InstrumentId) => void;
  readonly confirm: ShowApplicationConfirmation;
}

export interface ProjectInstrumentWorkflow {
  readonly select: (instrumentId: InstrumentId) => void;
  readonly add: (
    name: string,
    instrument: InstrumentConfig,
    color: string,
  ) => void;
  readonly moveSelected: (direction: -1 | 1) => void;
  readonly remove: (instrumentId: InstrumentId) => void;
  readonly update: (
    instrumentId: InstrumentId,
    changes: UpdateProjectInstrumentChanges,
    label: string,
  ) => void;
  readonly updateClipState: (
    instrumentId: InstrumentId,
    changes: Partial<ClipInstrumentState>,
    label: string,
  ) => void;
  readonly selectNotes: (instrumentId: InstrumentId) => void;
  readonly toggleLock: (instrument: ProjectInstrument) => void;
}

export function useProjectInstrumentWorkflow({
  commands,
  selectedInstrumentId,
  selectInstrument,
  toggleInstrumentSelection,
  removeInstrumentFromSelection,
  confirm,
}: ProjectInstrumentWorkflowOptions): ProjectInstrumentWorkflow {
  const instrumentSequenceRef = useRef(0);

  const update = useCallback(
    (
      instrumentId: InstrumentId,
      changes: UpdateProjectInstrumentChanges,
      label: string,
    ): void => {
      commands.dispatch(
        [{
          type: "UpdateProjectInstrument",
          instrumentId,
          changes,
        }],
        label,
      );
    },
    [commands],
  );

  const select = useCallback(
    (instrumentId: InstrumentId): void => {
      selectInstrument(instrumentId);
    },
    [selectInstrument],
  );

  const updateClipState = useCallback((
    instrumentId: InstrumentId,
    changes: Partial<ClipInstrumentState>,
    label: string,
  ): void => {
    commands.dispatch(
      [{ type: "UpdateClipInstrumentState", instrumentId, changes }],
      label,
    );
  }, [commands]);

  const add = useCallback((
    name: string,
    instrumentConfig: InstrumentConfig,
    color: string,
  ): void => {
    const state = commands.getState();
    const normalizedName = name.trim();

    if (normalizedName.length === 0) {
      return;
    }

    instrumentSequenceRef.current += 1;
    const instrument = createUserInstrument(
      instrumentSequenceRef.current,
      cloneInstrumentConfig(instrumentConfig),
      normalizedName,
      color,
    );
    const clipInstrumentStatesById = createInitialClipInstrumentStates(
      state.clipOrder,
    );

    commands.dispatch(
      [{
        type: "AddProjectInstrument",
        instrument,
        clipInstrumentStatesById,
      }],
      "Add instrument",
    );
    selectInstrument(instrument.id);
  }, [commands, selectInstrument]);

  const moveSelected = useCallback(
    (direction: -1 | 1): void => {
      if (selectedInstrumentId === null) {
        return;
      }

      const state = commands.getState();
      const currentIndex = state.instrumentOrder.indexOf(selectedInstrumentId);
      const nextIndex = currentIndex + direction;

      if (
        currentIndex < 0
        || nextIndex < 0
        || nextIndex >= state.instrumentOrder.length
      ) {
        return;
      }

      const displacedInstrumentId = state.instrumentOrder[nextIndex];

      if (displacedInstrumentId === undefined) {
        return;
      }

      const instrumentOrder = [...state.instrumentOrder];

      instrumentOrder[currentIndex] = displacedInstrumentId;
      instrumentOrder[nextIndex] = selectedInstrumentId;
      commands.dispatch(
        [{
          type: "ReorderProjectInstruments",
          instrumentOrder,
        }],
        direction < 0 ? "Move instrument up" : "Move instrument down",
      );
    },
    [commands, selectedInstrumentId],
  );

  const remove = useCallback(
    (instrumentId: InstrumentId): void => {
      const instrument = commands.getState().projectInstrumentsById[instrumentId];

      if (instrument === undefined) {
        return;
      }

      confirm({
        title: "Delete instrument?",
        message: `Delete "${instrument.name}" and all of its notes?`,
        confirmLabel: "Delete",
        tone: "danger",
        onConfirm(): void {
          const state = commands.getState();
          const instrumentIndex = state.instrumentOrder.indexOf(instrumentId);
          const nextInstrumentId =
            state.instrumentOrder[instrumentIndex + 1]
            ?? state.instrumentOrder[instrumentIndex - 1]
            ?? null;

          commands.dispatch(
            [{
              type: "DeleteProjectInstrument",
              instrumentId,
            }],
            "Delete instrument",
          );
          removeInstrumentFromSelection(instrumentId);

          if (selectedInstrumentId === instrumentId) {
            selectInstrument(nextInstrumentId);
          }
        },
      });
    },
    [
      commands,
      confirm,
      removeInstrumentFromSelection,
      selectInstrument,
      selectedInstrumentId,
    ],
  );

  const selectNotes = useCallback(
    (instrumentId: InstrumentId): void => {
      const state = commands.getState();

      if (
        state.projectInstrumentsById[instrumentId] === undefined
        || getActiveClip(state).instrumentStatesById[instrumentId]?.locked !== false
      ) {
        return;
      }

      selectInstrument(instrumentId);
      toggleInstrumentSelection(instrumentId);
    },
    [commands, selectInstrument, toggleInstrumentSelection],
  );

  const toggleLock = useCallback(
    (instrument: ProjectInstrument): void => {
      const instrumentState = getActiveClip(
        commands.getState(),
      ).instrumentStatesById[instrument.id];

      if (instrumentState === undefined) {
        return;
      }

      updateClipState(
        instrument.id,
        {
          locked: !instrumentState.locked,
        },
        instrumentState.locked ? "Unlock instrument" : "Lock instrument",
      );

      if (!instrumentState.locked) {
        removeInstrumentFromSelection(instrument.id);
      }
    },
    [commands, removeInstrumentFromSelection, updateClipState],
  );

  return {
    select,
    add,
    moveSelected,
    remove,
    update,
    updateClipState,
    selectNotes,
    toggleLock,
  };
}

function createUserInstrument(
  sequence: number,
  instrument: InstrumentConfig,
  name: string,
  color: string,
): ProjectInstrument {
  return createDefaultProjectInstrument({
    id: `instrument-${Date.now()}-${sequence}`,
    name,
    color,
    instrument,
  });
}

function cloneInstrumentConfig(config: InstrumentConfig): InstrumentConfig {
  return {
    ...config,
    envelope: { ...config.envelope },
    filterEnvelope: { ...config.filterEnvelope },
  };
}

function createInitialClipInstrumentStates(
  clipIds: readonly ClipId[],
): Record<ClipId, ClipInstrumentState> {
  const states: Record<ClipId, ClipInstrumentState> = {};

  for (const clipId of clipIds) {
    states[clipId] = createDefaultClipInstrumentState();
  }

  return states;
}
