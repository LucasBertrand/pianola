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
  MAXIMUM_PROJECT_VOICE_COUNT,
  MAXIMUM_VOICE_NAME_LENGTH,
  type AdsrEnvelope,
  type OscillatorWaveform,
  type SubtractiveSynthContinuousParameter,
  type Voice,
  type VoiceId,
} from "../../domain/model";
import {
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
}

export interface VoiceWorkflow {
  readonly select: (voiceId: VoiceId) => void;
  readonly add: () => void;
  readonly duplicate: (voiceId: VoiceId) => void;
  readonly moveSelected: (direction: -1 | 1) => void;
  readonly remove: (voiceId: VoiceId) => void;
  readonly update: (
    voiceId: VoiceId,
    changes: UpdateVoiceChanges,
    label: string,
  ) => void;
  readonly commitEnvelopeParameter: (
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

  const add = useCallback((): void => {
    const state = commands.getState();
    voiceSequenceRef.current += 1;
    const voice = createUserVoice(
      state.voiceOrder.length,
      voiceSequenceRef.current,
    );

    commands.dispatch(
      [{
        type: "AddVoice",
        voice,
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

  const duplicate = useCallback((voiceId: VoiceId): void => {
    const state = commands.getState();
    const sourceVoice = state.voicesById[voiceId];

    if (
      sourceVoice === undefined
      || state.voiceOrder.length >= MAXIMUM_PROJECT_VOICE_COUNT
    ) {
      return;
    }

    voiceSequenceRef.current += 1;
    const duplicatedVoice: Voice = {
      ...sourceVoice,
      id: createVoiceId(voiceSequenceRef.current),
      name: createCopyName(
        sourceVoice.name,
        MAXIMUM_VOICE_NAME_LENGTH,
      ),
      instrument: {
        ...sourceVoice.instrument,
        envelope: { ...sourceVoice.instrument.envelope },
        filterEnvelope: {
          ...sourceVoice.instrument.filterEnvelope,
        },
      },
      effects: sourceVoice.effects.map((effect) => ({
        ...effect,
        parameters: { ...effect.parameters },
      })),
      generativeRules: sourceVoice.generativeRules.map((rule) => ({
        ...rule,
        parameters: { ...rule.parameters },
      })),
      interpretation: { ...sourceVoice.interpretation },
    };
    const sourceIndex = state.voiceOrder.indexOf(voiceId);
    const voiceOrder = [...state.voiceOrder];

    voiceOrder.splice(sourceIndex + 1, 0, duplicatedVoice.id);
    commands.dispatch(
      [
        { type: "AddVoice", voice: duplicatedVoice },
        { type: "ReorderVoices", voiceOrder },
      ],
      "Duplicate voice",
    );
    selectVoice(duplicatedVoice.id);
  }, [commands, selectVoice]);

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
      const voice = commands.getState().voicesById[voiceId];

      if (voice === undefined) {
        return;
      }

      update(
        voiceId,
        {
          instrument: {
            ...voice.instrument,
            [envelopeKind === "amplitude"
              ? "envelope"
              : "filterEnvelope"]: {
              ...(envelopeKind === "amplitude"
                ? voice.instrument.envelope
                : voice.instrument.filterEnvelope),
              [parameter]: value,
            },
          },
        },
        `Update ${envelopeKind} ${parameter}`,
      );
    },
    [commands, update],
  );

  const commitWaveform = useCallback(
    (voiceId: VoiceId, waveform: OscillatorWaveform): void => {
      const voice = commands.getState().voicesById[voiceId];

      if (voice === undefined) {
        return;
      }

      update(
        voiceId,
        {
          instrument: {
            ...voice.instrument,
            oscillatorWaveform: waveform,
          },
        },
        "Update oscillator waveform",
      );
    },
    [commands, update],
  );

  const commitPolyphony = useCallback(
    (voiceId: VoiceId, polyphony: number): void => {
      const voice = commands.getState().voicesById[voiceId];

      if (voice === undefined) {
        return;
      }

      update(
        voiceId,
        {
          instrument: {
            ...voice.instrument,
            polyphony,
          },
        },
        "Update subtractive synth polyphony",
      );
    },
    [commands, update],
  );

  const commitInstrumentParameter = useCallback(
    (
      voiceId: VoiceId,
      parameter: SubtractiveSynthContinuousParameter,
      value: number,
    ): void => {
      const voice = commands.getState().voicesById[voiceId];

      if (voice === undefined) {
        return;
      }

      update(
        voiceId,
        {
          instrument: {
            ...voice.instrument,
            [parameter]: value,
          },
        },
        `Update ${parameter}`,
      );
    },
    [commands, update],
  );

  const selectNotes = useCallback(
    (voiceId: VoiceId): void => {
      if (commands.getState().voicesById[voiceId]?.locked !== false) {
        return;
      }

      selectVoice(voiceId);
      toggleVoiceSelection(voiceId);
    },
    [commands, selectVoice, toggleVoiceSelection],
  );

  const toggleLock = useCallback(
    (voice: Voice): void => {
      update(
        voice.id,
        {
          locked: !voice.locked,
        },
        voice.locked ? "Unlock voice" : "Lock voice",
      );

      if (!voice.locked) {
        removeVoiceFromSelection(voice.id);
      }
    },
    [removeVoiceFromSelection, update],
  );

  return {
    select,
    add,
    duplicate,
    moveSelected,
    remove,
    update,
    commitEnvelopeParameter,
    commitWaveform,
    commitPolyphony,
    commitInstrumentParameter,
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
    oscillatorWaveform: getDefaultOscillatorWaveform(voiceIndex),
  });
}

function createVoiceId(sequence: number): VoiceId {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `voice-${globalThis.crypto.randomUUID()}`;
  }

  return `voice-${Date.now()}-${sequence}`;
}

function createCopyName(name: string, maximumLength: number): string {
  const suffix = " Copy";

  return `${name.slice(0, maximumLength - suffix.length)}${suffix}`;
}
