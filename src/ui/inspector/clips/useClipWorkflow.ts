import {
  useCallback,
  useRef,
} from "react";
import type {
  UpdateClipChanges,
} from "../../../domain/commands/command-types";
import type {
  EditorCommandPort,
} from "../../../use-cases/commands/editor-command-service";
import {
  createDefaultTransportState,
} from "../../../domain/transport/transport";
import {
  RENDERING_CONSTANTS,
} from "../../../config/rendering-config";
import {
  createDefaultClipTimeline,
  DEFAULT_CLIP_COLOR,
  DEFAULT_MEASURE_COUNT,
  MAXIMUM_PROJECT_CLIP_COUNT,
  MAXIMUM_CLIP_NAME_LENGTH,
  type Clip,
  type Track,
  type ClipInstrumentState,
} from "../../../domain/clips/clip";
import {
  getClipPlaybackOrder,
} from "../../../domain/clips/clip-hierarchy";
import {
  type ClipId,
  type InstrumentId,
} from "../../../domain/identifiers";
import {
  createDefaultClipInstrumentState,
} from "../../../domain/project-instrument-factory";
import type {
  ShowApplicationConfirmation,
} from "../../../use-cases/dialogs/application-dialog-port";

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
  readonly reorder: (clipId: ClipId, targetIndex: number) => void;
  readonly remove: (clipId: ClipId) => void;
  readonly update: (clipId: ClipId, changes: UpdateClipChanges) => void;
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
      clipId === state.workspace.activeClipId
      || state.clipsById[clipId] === undefined
    ) {
      return;
    }

    beginClipChange();
    commands.selectClip(clipId);
  }, [beginClipChange, commands]);

  const add = useCallback((): void => {
    const state = commands.getState();

    const clipOrder = getClipPlaybackOrder(state.clipHierarchy);

    if (clipOrder.length >= MAXIMUM_PROJECT_CLIP_COUNT) {
      return;
    }

    clipSequenceRef.current += 1;
    const color = RENDERING_CONSTANTS.userInstrumentColors[
      clipOrder.length % RENDERING_CONSTANTS.userInstrumentColors.length
    ] ?? DEFAULT_CLIP_COLOR;

    const clip = createEmptyClip(
      state.instrumentOrder,
      state.clock,
      clipOrder.length,
      clipSequenceRef.current,
      color,
    );

    beginClipChange();
    commands.dispatch([{ type: "AddClip", clip }], "Add clip");
    commands.selectClip(clip.id);
  }, [beginClipChange, commands]);

  const reorder = useCallback((
    clipId: ClipId,
    targetIndex: number,
  ): void => {
    const state = commands.getState();
    const currentOrder = getClipPlaybackOrder(state.clipHierarchy);
    const currentIndex = currentOrder.indexOf(clipId);

    if (
      currentIndex < 0
      || targetIndex < 0
      || targetIndex >= currentOrder.length
      || targetIndex === currentIndex
    ) {
      return;
    }

    const clipOrder = [...currentOrder];
    const [movedClipId] = clipOrder.splice(currentIndex, 1);

    if (movedClipId === undefined) {
      return;
    }

    clipOrder.splice(targetIndex, 0, movedClipId);
    commands.dispatch(
      [{ type: "ReorderClips", clipOrder }],
      "Reorder clips",
    );
  }, [commands]);

  const duplicate = useCallback((clipId: ClipId): void => {
    const state = commands.getState();
    const sourceClip = state.clipsById[clipId];

    if (
      sourceClip === undefined
      || getClipPlaybackOrder(state.clipHierarchy).length >= MAXIMUM_PROJECT_CLIP_COUNT
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
      },
      timeline: {
        ...sourceClip.timeline,
        timeMap: {
          meterMarkers: sourceClip.timeline.timeMap.meterMarkers.map(
            (marker) => ({
              startTick: marker.startTick,
              timeSignature: marker.timeSignature.beatGroups === undefined
                ? {
                    numerator: marker.timeSignature.numerator,
                    denominator: marker.timeSignature.denominator,
                  }
                : {
                    numerator: marker.timeSignature.numerator,
                    denominator: marker.timeSignature.denominator,
                    beatGroups: [...marker.timeSignature.beatGroups],
                  },
            }),
          ),
          tempoMarkers: sourceClip.timeline.timeMap.tempoMarkers.map(
            (marker) => ({ ...marker }),
          ),
          scaleMarkers: sourceClip.timeline.timeMap.scaleMarkers.map(
            (marker) => ({ ...marker }),
          ),
        },
      },
    };
    const sourceIndex = getClipPlaybackOrder(state.clipHierarchy).indexOf(clipId);
    const clipOrder = [...getClipPlaybackOrder(state.clipHierarchy)];

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
    commands.selectClip(duplicatedClipId);
  }, [beginClipChange, commands, duplicateEditorState]);

  const remove = useCallback((clipId: ClipId): void => {
    const state = commands.getState();
    const clip = state.clipsById[clipId];

    if (clip === undefined || getClipPlaybackOrder(state.clipHierarchy).length <= 1) {
      return;
    }

    confirm({
      title: "Delete clip?",
      message: `Delete "${clip.name}" and all of its notes?`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm(): void {
        if (commands.getState().workspace.activeClipId === clipId) {
          beginClipChange();
        }

        commands.dispatch(
          [{ type: "DeleteClip", clipId }],
          "Delete clip",
        );
      },
    });
  }, [beginClipChange, commands, confirm]);

  const update = useCallback((
    clipId: ClipId,
    changes: UpdateClipChanges,
  ): void => {
    commands.dispatch(
      [{ type: "UpdateClip", clipId, changes }],
      "Update clip settings",
    );
  }, [commands]);

  return {
    select,
    add,
    duplicate,
    reorder,
    remove,
    update,
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
  clock: Parameters<typeof createDefaultClipTimeline>[0],
  clipIndex: number,
  sequence: number,
  color: string,
): Clip {
  const tracksByInstrumentId: Record<InstrumentId, Track> = {};
  const instrumentStatesById: Record<InstrumentId, ClipInstrumentState> = {};

  for (const instrumentId of instrumentOrder) {
    tracksByInstrumentId[instrumentId] = {
      instrumentId,
      notesById: {},
    };
    instrumentStatesById[instrumentId] = createDefaultClipInstrumentState();
  }

  return {
    id: createClipId(sequence),
    name: `Clip ${clipIndex + 1}`,
    color,
    timeline: createDefaultClipTimeline(clock, DEFAULT_MEASURE_COUNT),
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
