import {
  useCallback,
  useRef,
} from "react";
import type {
  UpdateClipChanges,
  UpdateClipGroupChanges,
} from "../../../domain/commands/command-types";
import type {
  EditorCommandPort,
} from "../../../application/history/editor-command-service";
import {
  createDefaultTransportState,
} from "../../../domain/transport/transport";
import {
  RENDERING_CONSTANTS,
} from "../../piano-roll/rendering/rendering-constants";
import {
  createDefaultClipTimeline,
  DEFAULT_CLIP_BYPASS_ENABLED,
  DEFAULT_CLIP_COLOR,
  DEFAULT_MEASURE_COUNT,
  MAXIMUM_PROJECT_CLIP_COUNT,
  MAXIMUM_CLIP_NAME_LENGTH,
  type ClipCreationSettings,
  type Clip,
  type InstrumentTrack,
} from "../../../domain/clips/clip";
import { duplicateClipValue } from "../../../domain/clips/duplicate-clip";
import {
  findClipHierarchyNodeLocation,
  findClipHierarchyGroup,
  getClipGroupChildren,
  getClipPlaybackOrder,
  DEFAULT_CLIP_GROUP_COLOR,
  type ClipHierarchyNodeIdentity,
} from "../../../domain/clips/clip-hierarchy";
import {
  type ClipGroupId,
  type ClipId,
  type InstrumentId,
} from "../../../domain/identifiers";
import type {
  ShowApplicationConfirmation,
  ShowApplicationAlert,
} from "../../../use-cases/dialogs/application-dialog-port";
import {
  useClipGroupConcatenation,
} from "./useClipGroupConcatenation";
import {
  useClipGroupDuplication,
} from "./useClipGroupDuplication";
import {
  useClipSplitting,
} from "./useClipSplitting";
import type {
  ClipSplitStrategy,
} from "../../../domain/clips/split-clip";

export interface ClipWorkflowOptions {
  readonly commands: EditorCommandPort;
  readonly beginClipChange: () => void;
  readonly duplicateEditorState: (
    sourceClipId: ClipId,
    targetClipId: ClipId,
  ) => void;
  readonly confirm: ShowApplicationConfirmation;
  readonly alert: ShowApplicationAlert;
}

export interface ClipWorkflow {
  readonly select: (clipId: ClipId) => void;
  readonly toggleBypass: (clipId: ClipId) => void;
  readonly add: (
    parentGroupId?: ClipGroupId | null,
    name?: string,
    settings?: ClipCreationSettings,
  ) => void;
  readonly duplicate: (clipId: ClipId) => void;
  readonly duplicateGroup: (groupId: ClipGroupId) => ClipGroupId | null;
  readonly split: (
    clipId: ClipId,
    strategy: ClipSplitStrategy,
  ) => ClipGroupId | null;
  readonly reorder: (clipId: ClipId, targetIndex: number) => void;
  readonly createGroup: (
    parentGroupId: ClipGroupId | null,
    name?: string,
    color?: string,
  ) => ClipGroupId | null;
  readonly concatenateGroup: (
    groupId: ClipGroupId,
    name: string,
  ) => ClipId | null;
  readonly updateGroup: (
    groupId: ClipGroupId,
    changes: UpdateClipGroupChanges,
  ) => void;
  readonly toggleGroupBypass: (groupId: ClipGroupId) => void;
  readonly ungroup: (groupId: ClipGroupId) => void;
  readonly deleteGroup: (groupId: ClipGroupId) => void;
  readonly moveNode: (
    node: ClipHierarchyNodeIdentity,
    targetParentGroupId: ClipGroupId | null,
    targetIndex: number,
  ) => void;
  readonly remove: (clipId: ClipId) => void;
  readonly update: (clipId: ClipId, changes: UpdateClipChanges) => void;
}

/** Coordinates clip lifecycle without leaking React state into the domain. */
export function useClipWorkflow({
  commands,
  beginClipChange,
  duplicateEditorState,
  confirm,
  alert,
}: ClipWorkflowOptions): ClipWorkflow {
  const clipSequenceRef = useRef(0);
  const groupSequenceRef = useRef(0);
  const concatenateGroup = useClipGroupConcatenation({
    commands,
    beginClipChange,
    duplicateEditorState,
    alert,
  });
  const duplicateGroup = useClipGroupDuplication({
    commands,
    beginClipChange,
    duplicateEditorState,
  });
  const split = useClipSplitting({
    commands,
    beginClipChange,
    duplicateEditorState,
    alert,
  });

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

  const add = useCallback((
    parentGroupId: ClipGroupId | null = null,
    name?: string,
    settings?: ClipCreationSettings,
  ): void => {
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
      name,
      settings,
    );

    beginClipChange();
    const parentChildren = getClipGroupChildren(
      state.clipHierarchy,
      parentGroupId,
    );

    if (parentChildren === null) {
      return;
    }

    const pendingCommands = parentGroupId === null
      ? [{ type: "AddClip", clip } as const]
      : [
          { type: "AddClip", clip } as const,
          {
            type: "MoveClipHierarchyNode",
            node: { kind: "clip", clipId: clip.id },
            targetParentGroupId: parentGroupId,
            targetIndex: parentChildren.length,
          } as const,
        ];

    commands.dispatch(pendingCommands, "Add clip");
    commands.selectClip(clip.id);
  }, [beginClipChange, commands]);

  const moveNode = useCallback((
    node: ClipHierarchyNodeIdentity,
    targetParentGroupId: ClipGroupId | null,
    targetIndex: number,
  ): void => {
    commands.dispatch([{
      type: "MoveClipHierarchyNode",
      node,
      targetParentGroupId,
      targetIndex,
    }], "Move clip hierarchy item");
  }, [commands]);

  const createGroup = useCallback((
    parentGroupId: ClipGroupId | null,
    name = "New group",
    color: string = DEFAULT_CLIP_GROUP_COLOR,
  ): ClipGroupId | null => {
    const state = commands.getState();
    const children = getClipGroupChildren(state.clipHierarchy, parentGroupId);

    if (children === null) {
      return null;
    }

    groupSequenceRef.current += 1;
    const groupId = createClipGroupId(groupSequenceRef.current);
    const result = commands.dispatch([{
      type: "CreateClipGroup",
      groupId,
      name,
      color,
      parentGroupId,
      index: children.length,
    }], "Create clip group");

    return result === null ? null : groupId;
  }, [commands]);

  const updateGroup = useCallback((
    groupId: ClipGroupId,
    changes: UpdateClipGroupChanges,
  ): void => {
    commands.dispatch([{
      type: "UpdateClipGroup",
      groupId,
      changes,
    }], "Update clip group");
  }, [commands]);

  const ungroup = useCallback((groupId: ClipGroupId): void => {
    commands.dispatch([{
      type: "UngroupClipGroup",
      groupId,
    }], "Ungroup clips");
  }, [commands]);

  const deleteGroup = useCallback((groupId: ClipGroupId): void => {
    const state = commands.getState();
    const children = getClipGroupChildren(state.clipHierarchy, groupId);

    if (children === null) {
      return;
    }

    const descendantClipIds = getClipPlaybackOrder(children);

    if (descendantClipIds.length >= Object.keys(state.clipsById).length) {
      return;
    }

    if (descendantClipIds.includes(state.workspace.activeClipId)) {
      beginClipChange();
    }

    commands.dispatch([{
      type: "DeleteClipGroup",
      groupId,
    }], "Delete clip group and clips");
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
    const duplicatedClip = duplicateClipValue(
      sourceClip,
      duplicatedClipId,
      createCopyName(sourceClip.name, MAXIMUM_CLIP_NAME_LENGTH),
    );
    const sourceLocation = findClipHierarchyNodeLocation(
      state.clipHierarchy,
      { kind: "clip", clipId },
    );

    if (sourceLocation === null) {
      return;
    }

    duplicateEditorState(clipId, duplicatedClipId);
    beginClipChange();
    commands.dispatch(
      [
        { type: "AddClip", clip: duplicatedClip },
        {
          type: "MoveClipHierarchyNode",
          node: { kind: "clip", clipId: duplicatedClipId },
          targetParentGroupId: sourceLocation.parentGroupId,
          targetIndex: sourceLocation.index + 1,
        },
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

  const toggleBypass = useCallback((clipId: ClipId): void => {
    const clip = commands.getState().clipsById[clipId];

    if (clip === undefined) {
      return;
    }

    commands.dispatch([{
      type: "UpdateClip",
      clipId,
      changes: { bypassEnabled: !clip.bypassEnabled },
    }], clip.bypassEnabled ? "Disable clip bypass" : "Enable clip bypass");
  }, [commands]);

  const toggleGroupBypass = useCallback((groupId: ClipGroupId): void => {
    const group = findClipHierarchyGroup(
      commands.getState().clipHierarchy,
      groupId,
    );

    if (group === undefined) {
      return;
    }

    commands.dispatch([{
      type: "UpdateClipGroup",
      groupId,
      changes: { bypassEnabled: !group.bypassEnabled },
    }], group.bypassEnabled
      ? "Disable clip group bypass"
      : "Enable clip group bypass");
  }, [commands]);

  return {
    select,
    toggleBypass,
    add,
    duplicate,
    duplicateGroup,
    split,
    reorder,
    createGroup,
    concatenateGroup,
    updateGroup,
    toggleGroupBypass,
    ungroup,
    deleteGroup,
    moveNode,
    remove,
    update,
  };
}

function createClipGroupId(sequence: number): ClipGroupId {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `clip-group-${globalThis.crypto.randomUUID()}`;
  }

  return `clip-group-${Date.now()}-${sequence}`;
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
  name?: string,
  settings?: ClipCreationSettings,
): Clip {
  const tracksByInstrumentId: Record<InstrumentId, InstrumentTrack> = {};

  for (const instrumentId of instrumentOrder) {
    tracksByInstrumentId[instrumentId] = {
      instrumentId,
      notesById: {},
    };
  }

  return {
    id: createClipId(sequence),
    name: name?.trim() || `Clip ${clipIndex + 1}`,
    color,
    bypassEnabled: DEFAULT_CLIP_BYPASS_ENABLED,
    timeline: createDefaultClipTimeline(
      clock,
      settings?.measureCount ?? DEFAULT_MEASURE_COUNT,
      settings?.timeSignature,
    ),
    tracksByInstrumentId,
    transportSettings: createDefaultTransportState(),
  };
}

function createClipId(sequence: number): ClipId {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `clip-${globalThis.crypto.randomUUID()}`;
  }

  return `clip-${Date.now()}-${sequence}`;
}
