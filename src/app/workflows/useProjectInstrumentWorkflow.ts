import {
  useCallback,
  useRef,
} from "react";
import type {
  EditorCommandPort,
} from "../../application/editor-command-service";
import {
  APPLICATION_COLORS,
} from "../../config/application-colors";
import {
  RENDERING_CONSTANTS,
} from "../../config/program-constants";
import type {
  UpdateProjectInstrumentChanges,
} from "../../domain/commands";
import {
  getActiveClip,
  type AdsrEnvelope,
  type ClipId,
  type OscillatorWaveform,
  type SubtractiveSynthContinuousParameter,
  type SubtractiveSynthConfig,
  type ProjectInstrument,
  type InstrumentId,
  type ClipInstrumentState,
} from "../../domain/model";
import {
  createDefaultClipInstrumentState,
  createDefaultProjectInstrument,
  getDefaultOscillatorWaveform,
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
  readonly previewInstrument: (
    instrumentId: InstrumentId,
    instrument: SubtractiveSynthConfig,
  ) => void;
}

export interface ProjectInstrumentWorkflow {
  readonly select: (instrumentId: InstrumentId) => void;
  readonly add: () => void;
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
  readonly commitEnvelopeParameter: (
    instrumentId: InstrumentId,
    envelopeKind: "amplitude" | "filter",
    parameter: keyof AdsrEnvelope,
    value: number,
  ) => void;
  readonly previewEnvelopeParameter: (
    instrumentId: InstrumentId,
    envelopeKind: "amplitude" | "filter",
    parameter: keyof AdsrEnvelope,
    value: number,
  ) => void;
  readonly commitWaveform: (
    instrumentId: InstrumentId,
    waveform: OscillatorWaveform,
  ) => void;
  readonly commitPolyphony: (
    instrumentId: InstrumentId,
    polyphony: number,
  ) => void;
  readonly commitInstrumentParameter: (
    instrumentId: InstrumentId,
    parameter: SubtractiveSynthContinuousParameter,
    value: number,
  ) => void;
  readonly previewInstrumentParameter: (
    instrumentId: InstrumentId,
    parameter: SubtractiveSynthContinuousParameter,
    value: number,
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
  previewInstrument,
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

  const add = useCallback((): void => {
    const state = commands.getState();
    instrumentSequenceRef.current += 1;
    const instrument = createUserInstrument(
      state.instrumentOrder.length,
      instrumentSequenceRef.current,
    );
    const clipInstrumentStatesById = createInitialClipInstrumentStates(
      state.clipOrder,
      getDefaultOscillatorWaveform(state.instrumentOrder.length),
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

  const commitEnvelopeParameter = useCallback(
    (
      instrumentId: InstrumentId,
      envelopeKind: "amplitude" | "filter",
      parameter: keyof AdsrEnvelope,
      value: number,
    ): void => {
      const instrumentState = getActiveClip(
        commands.getState(),
      ).instrumentStatesById[instrumentId];

      if (instrumentState === undefined) {
        return;
      }

      updateClipState(
        instrumentId,
        {
          instrument: {
            ...instrumentState.instrument,
            [envelopeKind === "amplitude"
              ? "envelope"
              : "filterEnvelope"]: {
              ...(envelopeKind === "amplitude"
                ? instrumentState.instrument.envelope
                : instrumentState.instrument.filterEnvelope),
              [parameter]: value,
            },
          },
        },
        `Update ${envelopeKind} ${parameter}`,
      );
    },
    [commands, updateClipState],
  );

  const previewEnvelopeParameter = useCallback(
    (
      instrumentId: InstrumentId,
      envelopeKind: "amplitude" | "filter",
      parameter: keyof AdsrEnvelope,
      value: number,
    ): void => {
      const instrumentState = getActiveClip(
        commands.getState(),
      ).instrumentStatesById[instrumentId];

      if (instrumentState === undefined) {
        return;
      }

      previewInstrument(instrumentId, {
        ...instrumentState.instrument,
        [envelopeKind === "amplitude"
          ? "envelope"
          : "filterEnvelope"]: {
          ...(envelopeKind === "amplitude"
            ? instrumentState.instrument.envelope
            : instrumentState.instrument.filterEnvelope),
          [parameter]: value,
        },
      });
    },
    [commands, previewInstrument],
  );

  const commitWaveform = useCallback(
    (instrumentId: InstrumentId, waveform: OscillatorWaveform): void => {
      const instrumentState = getActiveClip(
        commands.getState(),
      ).instrumentStatesById[instrumentId];

      if (instrumentState === undefined) {
        return;
      }

      updateClipState(
        instrumentId,
        {
          instrument: {
            ...instrumentState.instrument,
            oscillatorWaveform: waveform,
          },
        },
        "Update oscillator waveform",
      );
    },
    [commands, updateClipState],
  );

  const commitPolyphony = useCallback(
    (instrumentId: InstrumentId, polyphony: number): void => {
      const instrumentState = getActiveClip(
        commands.getState(),
      ).instrumentStatesById[instrumentId];

      if (instrumentState === undefined) {
        return;
      }

      updateClipState(
        instrumentId,
        {
          instrument: {
            ...instrumentState.instrument,
            polyphony,
          },
        },
        "Update subtractive synth polyphony",
      );
    },
    [commands, updateClipState],
  );

  const commitInstrumentParameter = useCallback(
    (
      instrumentId: InstrumentId,
      parameter: SubtractiveSynthContinuousParameter,
      value: number,
    ): void => {
      const instrumentState = getActiveClip(
        commands.getState(),
      ).instrumentStatesById[instrumentId];

      if (instrumentState === undefined) {
        return;
      }

      updateClipState(
        instrumentId,
        {
          instrument: {
            ...instrumentState.instrument,
            [parameter]: value,
          },
        },
        `Update ${parameter}`,
      );
    },
    [commands, updateClipState],
  );

  const previewInstrumentParameter = useCallback(
    (
      instrumentId: InstrumentId,
      parameter: SubtractiveSynthContinuousParameter,
      value: number,
    ): void => {
      const instrumentState = getActiveClip(
        commands.getState(),
      ).instrumentStatesById[instrumentId];

      if (instrumentState === undefined) {
        return;
      }

      previewInstrument(instrumentId, {
        ...instrumentState.instrument,
        [parameter]: value,
      });
    },
    [commands, previewInstrument],
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
    commitEnvelopeParameter,
    previewEnvelopeParameter,
    commitWaveform,
    commitPolyphony,
    commitInstrumentParameter,
    previewInstrumentParameter,
    selectNotes,
    toggleLock,
  };
}

function createUserInstrument(
  instrumentIndex: number,
  sequence: number,
): ProjectInstrument {
  const color =
    RENDERING_CONSTANTS.userInstrumentColors[
      instrumentIndex % RENDERING_CONSTANTS.userInstrumentColors.length
    ]
    ?? APPLICATION_COLORS.accent.primary;

  return createDefaultProjectInstrument({
    id: `instrument-${Date.now()}-${sequence}`,
    name: `Instrument ${instrumentIndex + 1}`,
    color,
  });
}

function createInitialClipInstrumentStates(
  clipIds: readonly ClipId[],
  waveform: OscillatorWaveform,
): Record<ClipId, ClipInstrumentState> {
  const states: Record<ClipId, ClipInstrumentState> = {};

  for (const clipId of clipIds) {
    states[clipId] = createDefaultClipInstrumentState(waveform);
  }

  return states;
}
