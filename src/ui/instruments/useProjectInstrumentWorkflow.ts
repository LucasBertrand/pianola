import {
  useCallback,
  useRef,
} from "react";
import type {
  EditorCommandPort,
} from "../../use-cases/commands/editor-command-service";
import type {
  UpdateProjectInstrumentChanges,
} from "../../domain/commands/command-types";
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
} from "../../use-cases/dialogs/application-dialog-port";

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
    instrumentConfig: InstrumentConfig,
    color: string,
  ) => void;
  readonly reorder: (
    instrumentId: InstrumentId,
    targetIndex: number,
  ) => void;
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
  readonly toggleLock: (projectInstrument: ProjectInstrument) => void;
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
      [{
        type: "UpdateClipInstrumentState",
        clipId: getActiveClip(commands.getState()).id,
        instrumentId,
        changes,
      }],
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
    const projectInstrument = createUserInstrument(
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
        instrument: projectInstrument,
        clipInstrumentStatesById,
      }],
      "Add instrument",
    );
    selectInstrument(projectInstrument.id);
  }, [commands, selectInstrument]);

  const reorder = useCallback(
    (instrumentId: InstrumentId, targetIndex: number): void => {
      const state = commands.getState();
      const currentIndex = state.instrumentOrder.indexOf(instrumentId);

      if (
        currentIndex < 0
        || targetIndex < 0
        || targetIndex >= state.instrumentOrder.length
        || targetIndex === currentIndex
      ) {
        return;
      }

      const instrumentOrder = [...state.instrumentOrder];
      const [movedInstrumentId] = instrumentOrder.splice(currentIndex, 1);

      if (movedInstrumentId === undefined) {
        return;
      }

      instrumentOrder.splice(targetIndex, 0, movedInstrumentId);
      commands.dispatch(
        [{
          type: "ReorderProjectInstruments",
          instrumentOrder,
        }],
        "Reorder instruments",
      );
    },
    [commands],
  );

  const remove = useCallback(
    (instrumentId: InstrumentId): void => {
      const projectInstrument =
        commands.getState().projectInstrumentsById[instrumentId];

      if (projectInstrument === undefined) {
        return;
      }

      confirm({
        title: "Delete instrument?",
        message: `Delete "${projectInstrument.name}" and all of its notes?`,
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
    (projectInstrument: ProjectInstrument): void => {
      const clipInstrumentState = getActiveClip(
        commands.getState(),
      ).instrumentStatesById[projectInstrument.id];

      if (clipInstrumentState === undefined) {
        return;
      }

      updateClipState(
        projectInstrument.id,
        {
          locked: !clipInstrumentState.locked,
        },
        clipInstrumentState.locked ? "Unlock instrument" : "Lock instrument",
      );

      if (!clipInstrumentState.locked) {
        removeInstrumentFromSelection(projectInstrument.id);
      }
    },
    [commands, removeInstrumentFromSelection, updateClipState],
  );

  return {
    select,
    add,
    reorder,
    remove,
    update,
    updateClipState,
    selectNotes,
    toggleLock,
  };
}

function createUserInstrument(
  sequence: number,
  instrumentConfig: InstrumentConfig,
  name: string,
  color: string,
): ProjectInstrument {
  return createDefaultProjectInstrument({
    id: `instrument-${Date.now()}-${sequence}`,
    name,
    color,
    instrument: instrumentConfig,
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
