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
  type Clip,
  type ClipId,
  type Track,
  type VoiceId,
} from "../../domain/model";
import type {
  ShowApplicationConfirmation,
} from "./dialog-types";

export interface ClipWorkflowOptions {
  readonly commands: EditorCommandPort;
  readonly beginClipChange: () => void;
  readonly confirm: ShowApplicationConfirmation;
}

export interface ClipWorkflow {
  readonly select: (clipId: ClipId) => void;
  readonly add: () => void;
  readonly moveActive: (direction: -1 | 1) => void;
  readonly remove: (clipId: ClipId) => void;
  readonly rename: (clipId: ClipId, name: string) => void;
}

/** Coordinates clip lifecycle without leaking React state into the domain. */
export function useClipWorkflow({
  commands,
  beginClipChange,
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
    moveActive,
    remove,
    rename,
  };
}

function createEmptyClip(
  voiceOrder: readonly VoiceId[],
  clipIndex: number,
  sequence: number,
): Clip {
  const tracksByVoiceId: Record<VoiceId, Track> = {};

  for (const voiceId of voiceOrder) {
    tracksByVoiceId[voiceId] = {
      voiceId,
      notesById: {},
    };
  }

  return {
    id: createClipId(sequence),
    name: `Clip ${clipIndex + 1}`,
    measureCount: DEFAULT_MEASURE_COUNT,
    tracksByVoiceId,
    transportSettings: createDefaultTransportState(),
  };
}

function createClipId(sequence: number): ClipId {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `clip-${globalThis.crypto.randomUUID()}`;
  }

  return `clip-${Date.now()}-${sequence}`;
}
