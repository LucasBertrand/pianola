import {
  useCallback,
  useRef,
} from "react";
import type {
  EditorCommandPort,
} from "../../application/editor-command-service";
import {
  createDefaultTransportState,
  DEFAULT_MEASURE_COUNT,
  MAXIMUM_PROJECT_CLIP_COUNT,
  MAXIMUM_CLIP_NAME_LENGTH,
  type Clip,
  type ClipId,
  type Track,
  type VoiceId,
  type ClipVoiceState,
} from "../../domain/model";
import {
  cloneInstrumentConfig,
  createDefaultClipVoiceState,
} from "../../domain/voice-factory";
import type {
  ShowApplicationConfirmation,
} from "./dialog-types";

export interface ClipWorkflowOptions {
  readonly commands: EditorCommandPort;
  readonly beginClipChange: () => void;
  readonly duplicateEditorState: (
    sourceClipId: ClipId,
    targetClipId: ClipId,
  ) => void;
  readonly confirm: ShowApplicationConfirmation;
}

export interface ClipWorkflow {
  readonly select: (clipId: ClipId) => void;
  readonly add: () => void;
  readonly duplicate: (clipId: ClipId) => void;
  readonly moveActive: (direction: -1 | 1) => void;
  readonly remove: (clipId: ClipId) => void;
  readonly rename: (clipId: ClipId, name: string) => void;
}

/** Coordinates clip lifecycle without leaking React state into the domain. */
export function useClipWorkflow({
  commands,
  beginClipChange,
  duplicateEditorState,
  confirm,
}: ClipWorkflowOptions): ClipWorkflow {
  const clipSequenceRef = useRef(0);

  const select = useCallback((clipId: ClipId): void => {
    const state = commands.getState();

    if (
      clipId === state.activeClipId
      || state.clipsById[clipId] === undefined
    ) {
      return;
    }

    beginClipChange();
    commands.dispatch(
      [{ type: "ActivateClip", clipId }],
      "Select clip",
    );
  }, [beginClipChange, commands]);

  const add = useCallback((): void => {
    const state = commands.getState();

    if (state.clipOrder.length >= MAXIMUM_PROJECT_CLIP_COUNT) {
      return;
    }

    clipSequenceRef.current += 1;
    const clip = createEmptyClip(
      state.voiceOrder,
      state.clipOrder.length,
      clipSequenceRef.current,
    );

    beginClipChange();
    commands.dispatch([{ type: "AddClip", clip }], "Add clip");
  }, [beginClipChange, commands]);

  const moveActive = useCallback((direction: -1 | 1): void => {
    const state = commands.getState();
    const currentIndex = state.clipOrder.indexOf(state.activeClipId);
    const nextIndex = currentIndex + direction;

    if (
      currentIndex < 0
      || nextIndex < 0
      || nextIndex >= state.clipOrder.length
    ) {
      return;
    }

    const displacedClipId = state.clipOrder[nextIndex];

    if (displacedClipId === undefined) {
      return;
    }

    const clipOrder = [...state.clipOrder];

    clipOrder[currentIndex] = displacedClipId;
    clipOrder[nextIndex] = state.activeClipId;
    commands.dispatch(
      [{ type: "ReorderClips", clipOrder }],
      direction < 0 ? "Move clip up" : "Move clip down",
    );
  }, [commands]);

  const duplicate = useCallback((clipId: ClipId): void => {
    const state = commands.getState();
    const sourceClip = state.clipsById[clipId];

    if (
      sourceClip === undefined
      || state.clipOrder.length >= MAXIMUM_PROJECT_CLIP_COUNT
    ) {
      return;
    }

    clipSequenceRef.current += 1;
    const duplicatedClipId = createClipId(clipSequenceRef.current);
    const duplicatedClip: Clip = {
      ...sourceClip,
      id: duplicatedClipId,
      name: createCopyName(sourceClip.name, MAXIMUM_CLIP_NAME_LENGTH),
      tracksByVoiceId: cloneClipTracks(sourceClip.tracksByVoiceId),
      voiceStatesById: cloneClipVoiceStates(
        sourceClip.voiceStatesById,
      ),
      transportSettings: {
        ...sourceClip.transportSettings,
        loop: { ...sourceClip.transportSettings.loop },
        timeSignature: {
          ...sourceClip.transportSettings.timeSignature,
        },
      },
    };
    const sourceIndex = state.clipOrder.indexOf(clipId);
    const clipOrder = [...state.clipOrder];

    clipOrder.splice(sourceIndex + 1, 0, duplicatedClipId);
    duplicateEditorState(clipId, duplicatedClipId);
    beginClipChange();
    commands.dispatch(
      [
        { type: "AddClip", clip: duplicatedClip },
        { type: "ReorderClips", clipOrder },
      ],
      "Duplicate clip",
    );
  }, [beginClipChange, commands, duplicateEditorState]);

  const remove = useCallback((clipId: ClipId): void => {
    const state = commands.getState();
    const clip = state.clipsById[clipId];

    if (clip === undefined || state.clipOrder.length <= 1) {
      return;
    }

    confirm({
      title: "Delete clip?",
      message: `Delete "${clip.name}" and all of its notes?`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm(): void {
        if (commands.getState().activeClipId === clipId) {
          beginClipChange();
        }

        commands.dispatch(
          [{ type: "DeleteClip", clipId }],
          "Delete clip",
        );
      },
    });
  }, [beginClipChange, commands, confirm]);

  const rename = useCallback((clipId: ClipId, name: string): void => {
    commands.dispatch(
      [{ type: "RenameClip", clipId, name }],
      "Rename clip",
    );
  }, [commands]);

  return {
    select,
    add,
    duplicate,
    moveActive,
    remove,
    rename,
  };
}

function cloneClipTracks(
  sourceTracks: Readonly<Record<VoiceId, Track>>,
): Record<VoiceId, Track> {
  const tracks: Record<VoiceId, Track> = {};

  for (const [voiceId, track] of Object.entries(sourceTracks)) {
    tracks[voiceId] = {
      voiceId,
      notesById: { ...track.notesById },
    };
  }

  return tracks;
}

function createCopyName(name: string, maximumLength: number): string {
  const suffix = " Copy";

  return `${name.slice(0, maximumLength - suffix.length)}${suffix}`;
}

function createEmptyClip(
  voiceOrder: readonly VoiceId[],
  clipIndex: number,
  sequence: number,
): Clip {
  const tracksByVoiceId: Record<VoiceId, Track> = {};
  const voiceStatesById: Record<VoiceId, ClipVoiceState> = {};

  for (const voiceId of voiceOrder) {
    tracksByVoiceId[voiceId] = {
      voiceId,
      notesById: {},
    };
    voiceStatesById[voiceId] = createDefaultClipVoiceState();
  }

  return {
    id: createClipId(sequence),
    name: `Clip ${clipIndex + 1}`,
    measureCount: DEFAULT_MEASURE_COUNT,
    tracksByVoiceId,
    voiceStatesById,
    transportSettings: createDefaultTransportState(),
  };
}

function cloneClipVoiceStates(
  sourceStates: Readonly<Record<VoiceId, ClipVoiceState>>,
): Record<VoiceId, ClipVoiceState> {
  const states: Record<VoiceId, ClipVoiceState> = {};

  for (const [voiceId, state] of Object.entries(sourceStates)) {
    states[voiceId] = {
      ...state,
      instrument: cloneInstrumentConfig(state.instrument),
    };
  }

  return states;
}

function createClipId(sequence: number): ClipId {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `clip-${globalThis.crypto.randomUUID()}`;
  }

  return `clip-${Date.now()}-${sequence}`;
}
