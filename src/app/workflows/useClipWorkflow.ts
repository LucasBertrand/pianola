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
  type InstrumentId,
  type ClipInstrumentState,
  type PresetId,
} from "../../domain/model";
import {
  createDefaultClipInstrumentState,
} from "../../domain/project-instrument-factory";
import {
  selectInstrumentPresetId,
} from "../../domain/instrument-presets";
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
      state.instrumentOrder,
      selectInstrumentPresetId(state.instrumentPresetOrder, 0),
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
      tracksByInstrumentId: cloneClipTracks(sourceClip.tracksByInstrumentId),
      instrumentStatesById: cloneClipInstrumentStates(
        sourceClip.instrumentStatesById,
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
  sourceTracks: Readonly<Record<InstrumentId, Track>>,
): Record<InstrumentId, Track> {
  const tracks: Record<InstrumentId, Track> = {};

  for (const [instrumentId, track] of Object.entries(sourceTracks)) {
    tracks[instrumentId] = {
      instrumentId,
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
  instrumentOrder: readonly InstrumentId[],
  presetId: PresetId,
  clipIndex: number,
  sequence: number,
): Clip {
  const tracksByInstrumentId: Record<InstrumentId, Track> = {};
  const instrumentStatesById: Record<InstrumentId, ClipInstrumentState> = {};

  for (const instrumentId of instrumentOrder) {
    tracksByInstrumentId[instrumentId] = {
      instrumentId,
      notesById: {},
    };
    instrumentStatesById[instrumentId] =
      createDefaultClipInstrumentState(presetId);
  }

  return {
    id: createClipId(sequence),
    name: `Clip ${clipIndex + 1}`,
    measureCount: DEFAULT_MEASURE_COUNT,
    tracksByInstrumentId,
    instrumentStatesById,
    transportSettings: createDefaultTransportState(),
  };
}

function cloneClipInstrumentStates(
  sourceStates: Readonly<Record<InstrumentId, ClipInstrumentState>>,
): Record<InstrumentId, ClipInstrumentState> {
  const states: Record<InstrumentId, ClipInstrumentState> = {};

  for (const [instrumentId, state] of Object.entries(sourceStates)) {
    states[instrumentId] = {
      ...state,
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
