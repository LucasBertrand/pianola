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
  UpdateVoiceChanges,
} from "../../domain/commands";
import {
  getActiveClip,
  type AdsrEnvelope,
  type ClipId,
  type OscillatorWaveform,
  type SubtractiveSynthContinuousParameter,
  type SubtractiveSynthConfig,
  type Voice,
  type VoiceId,
  type ClipVoiceState,
} from "../../domain/model";
import {
  createDefaultClipVoiceState,
  createDefaultVoice,
  getDefaultOscillatorWaveform,
} from "../../domain/voice-factory";
import type {
  ShowApplicationConfirmation,
} from "./dialog-types";

export interface VoiceWorkflowOptions {
  readonly commands: EditorCommandPort;
  readonly selectedVoiceId: VoiceId | null;
  readonly selectVoice: (voiceId: VoiceId | null) => void;
  readonly toggleVoiceSelection: (voiceId: VoiceId) => void;
  readonly removeVoiceFromSelection: (voiceId: VoiceId) => void;
  readonly confirm: ShowApplicationConfirmation;
  readonly previewInstrument: (
    voiceId: VoiceId,
    instrument: SubtractiveSynthConfig,
  ) => void;
}

export interface VoiceWorkflow {
  readonly select: (voiceId: VoiceId) => void;
  readonly add: () => void;
  readonly moveSelected: (direction: -1 | 1) => void;
  readonly remove: (voiceId: VoiceId) => void;
  readonly update: (
    voiceId: VoiceId,
    changes: UpdateVoiceChanges,
    label: string,
  ) => void;
  readonly updateClipState: (
    voiceId: VoiceId,
    changes: Partial<ClipVoiceState>,
    label: string,
  ) => void;
  readonly commitEnvelopeParameter: (
    voiceId: VoiceId,
    envelopeKind: "amplitude" | "filter",
    parameter: keyof AdsrEnvelope,
    value: number,
  ) => void;
  readonly previewEnvelopeParameter: (
    voiceId: VoiceId,
    envelopeKind: "amplitude" | "filter",
    parameter: keyof AdsrEnvelope,
    value: number,
  ) => void;
  readonly commitWaveform: (
    voiceId: VoiceId,
    waveform: OscillatorWaveform,
  ) => void;
  readonly commitPolyphony: (
    voiceId: VoiceId,
    polyphony: number,
  ) => void;
  readonly commitInstrumentParameter: (
    voiceId: VoiceId,
    parameter: SubtractiveSynthContinuousParameter,
    value: number,
  ) => void;
  readonly previewInstrumentParameter: (
    voiceId: VoiceId,
    parameter: SubtractiveSynthContinuousParameter,
    value: number,
  ) => void;
  readonly selectNotes: (voiceId: VoiceId) => void;
  readonly toggleLock: (voice: Voice) => void;
}

export function useVoiceWorkflow({
  commands,
  selectedVoiceId,
  selectVoice,
  toggleVoiceSelection,
  removeVoiceFromSelection,
  confirm,
  previewInstrument,
}: VoiceWorkflowOptions): VoiceWorkflow {
  const voiceSequenceRef = useRef(0);

  const update = useCallback(
    (
      voiceId: VoiceId,
      changes: UpdateVoiceChanges,
      label: string,
    ): void => {
      commands.dispatch(
        [{
          type: "UpdateVoice",
          voiceId,
          changes,
        }],
        label,
      );
    },
    [commands],
  );

  const select = useCallback(
    (voiceId: VoiceId): void => {
      selectVoice(voiceId);
    },
    [selectVoice],
  );

  const updateClipState = useCallback((
    voiceId: VoiceId,
    changes: Partial<ClipVoiceState>,
    label: string,
  ): void => {
    commands.dispatch(
      [{ type: "UpdateClipVoiceState", voiceId, changes }],
      label,
    );
  }, [commands]);

  const add = useCallback((): void => {
    const state = commands.getState();
    voiceSequenceRef.current += 1;
    const voice = createUserVoice(
      state.voiceOrder.length,
      voiceSequenceRef.current,
    );
    const clipVoiceStatesById = createInitialClipVoiceStates(
      state.clipOrder,
      getDefaultOscillatorWaveform(state.voiceOrder.length),
    );

    commands.dispatch(
      [{
        type: "AddVoice",
        voice,
        clipVoiceStatesById,
      }],
      "Add voice",
    );
    selectVoice(voice.id);
  }, [commands, selectVoice]);

  const moveSelected = useCallback(
    (direction: -1 | 1): void => {
      if (selectedVoiceId === null) {
        return;
      }

      const state = commands.getState();
      const currentIndex = state.voiceOrder.indexOf(selectedVoiceId);
      const nextIndex = currentIndex + direction;

      if (
        currentIndex < 0
        || nextIndex < 0
        || nextIndex >= state.voiceOrder.length
      ) {
        return;
      }

      const displacedVoiceId = state.voiceOrder[nextIndex];

      if (displacedVoiceId === undefined) {
        return;
      }

      const voiceOrder = [...state.voiceOrder];

      voiceOrder[currentIndex] = displacedVoiceId;
      voiceOrder[nextIndex] = selectedVoiceId;
      commands.dispatch(
        [{
          type: "ReorderVoices",
          voiceOrder,
        }],
        direction < 0 ? "Move voice up" : "Move voice down",
      );
    },
    [commands, selectedVoiceId],
  );

  const remove = useCallback(
    (voiceId: VoiceId): void => {
      const voice = commands.getState().voicesById[voiceId];

      if (voice === undefined) {
        return;
      }

      confirm({
        title: "Delete voice?",
        message: `Delete "${voice.name}" and all of its notes?`,
        confirmLabel: "Delete",
        tone: "danger",
        onConfirm(): void {
          const state = commands.getState();
          const voiceIndex = state.voiceOrder.indexOf(voiceId);
          const nextVoiceId =
            state.voiceOrder[voiceIndex + 1]
            ?? state.voiceOrder[voiceIndex - 1]
            ?? null;

          commands.dispatch(
            [{
              type: "DeleteVoice",
              voiceId,
            }],
            "Delete voice",
          );
          removeVoiceFromSelection(voiceId);

          if (selectedVoiceId === voiceId) {
            selectVoice(nextVoiceId);
          }
        },
      });
    },
    [
      commands,
      confirm,
      removeVoiceFromSelection,
      selectVoice,
      selectedVoiceId,
    ],
  );

  const commitEnvelopeParameter = useCallback(
    (
      voiceId: VoiceId,
      envelopeKind: "amplitude" | "filter",
      parameter: keyof AdsrEnvelope,
      value: number,
    ): void => {
      const voiceState = getActiveClip(
        commands.getState(),
      ).voiceStatesById[voiceId];

      if (voiceState === undefined) {
        return;
      }

      updateClipState(
        voiceId,
        {
          instrument: {
            ...voiceState.instrument,
            [envelopeKind === "amplitude"
              ? "envelope"
              : "filterEnvelope"]: {
              ...(envelopeKind === "amplitude"
                ? voiceState.instrument.envelope
                : voiceState.instrument.filterEnvelope),
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
      voiceId: VoiceId,
      envelopeKind: "amplitude" | "filter",
      parameter: keyof AdsrEnvelope,
      value: number,
    ): void => {
      const voiceState = getActiveClip(
        commands.getState(),
      ).voiceStatesById[voiceId];

      if (voiceState === undefined) {
        return;
      }

      previewInstrument(voiceId, {
        ...voiceState.instrument,
        [envelopeKind === "amplitude"
          ? "envelope"
          : "filterEnvelope"]: {
          ...(envelopeKind === "amplitude"
            ? voiceState.instrument.envelope
            : voiceState.instrument.filterEnvelope),
          [parameter]: value,
        },
      });
    },
    [commands, previewInstrument],
  );

  const commitWaveform = useCallback(
    (voiceId: VoiceId, waveform: OscillatorWaveform): void => {
      const voiceState = getActiveClip(
        commands.getState(),
      ).voiceStatesById[voiceId];

      if (voiceState === undefined) {
        return;
      }

      updateClipState(
        voiceId,
        {
          instrument: {
            ...voiceState.instrument,
            oscillatorWaveform: waveform,
          },
        },
        "Update oscillator waveform",
      );
    },
    [commands, updateClipState],
  );

  const commitPolyphony = useCallback(
    (voiceId: VoiceId, polyphony: number): void => {
      const voiceState = getActiveClip(
        commands.getState(),
      ).voiceStatesById[voiceId];

      if (voiceState === undefined) {
        return;
      }

      updateClipState(
        voiceId,
        {
          instrument: {
            ...voiceState.instrument,
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
      voiceId: VoiceId,
      parameter: SubtractiveSynthContinuousParameter,
      value: number,
    ): void => {
      const voiceState = getActiveClip(
        commands.getState(),
      ).voiceStatesById[voiceId];

      if (voiceState === undefined) {
        return;
      }

      updateClipState(
        voiceId,
        {
          instrument: {
            ...voiceState.instrument,
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
      voiceId: VoiceId,
      parameter: SubtractiveSynthContinuousParameter,
      value: number,
    ): void => {
      const voiceState = getActiveClip(
        commands.getState(),
      ).voiceStatesById[voiceId];

      if (voiceState === undefined) {
        return;
      }

      previewInstrument(voiceId, {
        ...voiceState.instrument,
        [parameter]: value,
      });
    },
    [commands, previewInstrument],
  );

  const selectNotes = useCallback(
    (voiceId: VoiceId): void => {
      const state = commands.getState();

      if (
        state.voicesById[voiceId] === undefined
        || getActiveClip(state).voiceStatesById[voiceId]?.locked !== false
      ) {
        return;
      }

      selectVoice(voiceId);
      toggleVoiceSelection(voiceId);
    },
    [commands, selectVoice, toggleVoiceSelection],
  );

  const toggleLock = useCallback(
    (voice: Voice): void => {
      const voiceState = getActiveClip(
        commands.getState(),
      ).voiceStatesById[voice.id];

      if (voiceState === undefined) {
        return;
      }

      updateClipState(
        voice.id,
        {
          locked: !voiceState.locked,
        },
        voiceState.locked ? "Unlock voice" : "Lock voice",
      );

      if (!voiceState.locked) {
        removeVoiceFromSelection(voice.id);
      }
    },
    [commands, removeVoiceFromSelection, updateClipState],
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

function createUserVoice(
  voiceIndex: number,
  sequence: number,
): Voice {
  const color =
    RENDERING_CONSTANTS.userVoiceColors[
      voiceIndex % RENDERING_CONSTANTS.userVoiceColors.length
    ]
    ?? APPLICATION_COLORS.accent.primary;

  return createDefaultVoice({
    id: `voice-${Date.now()}-${sequence}`,
    name: `Voice ${voiceIndex + 1}`,
    color,
  });
}

function createInitialClipVoiceStates(
  clipIds: readonly ClipId[],
  waveform: OscillatorWaveform,
): Record<ClipId, ClipVoiceState> {
  const states: Record<ClipId, ClipVoiceState> = {};

  for (const clipId of clipIds) {
    states[clipId] = createDefaultClipVoiceState(waveform);
  }

  return states;
}
