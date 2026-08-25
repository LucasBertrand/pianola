import {
  useCallback,
  useRef,
} from "react";
import {
  duplicateClipValue,
} from "../../../domain/clips/duplicate-clip";
import {
  countClipGroups,
  findClipHierarchyGroup,
  findClipHierarchyNodeLocation,
  getClipPlaybackOrder,
  MAXIMUM_CLIP_GROUP_COUNT,
  MAXIMUM_CLIP_GROUP_NAME_LENGTH,
  type ClipHierarchyGroupNode,
  type ClipHierarchyNode,
} from "../../../domain/clips/clip-hierarchy";
import {
  MAXIMUM_PROJECT_CLIP_COUNT,
} from "../../../domain/clips/clip";
import type {
  PianoRollCommand,
} from "../../../domain/commands/command-types";
import type {
  ClipGroupId,
  ClipId,
} from "../../../domain/identifiers";
import type {
  EditorCommandPort,
} from "../../../use-cases/commands/editor-command-service";

export interface ClipGroupDuplicationOptions {
  readonly commands: EditorCommandPort;
  readonly beginClipChange: () => void;
  readonly duplicateEditorState: (
    sourceClipId: ClipId,
    targetClipId: ClipId,
  ) => void;
}

/** Duplicates a complete group subtree in one undoable transaction. */
export function useClipGroupDuplication({
  commands,
  beginClipChange,
  duplicateEditorState,
}: ClipGroupDuplicationOptions): (groupId: ClipGroupId) => ClipGroupId | null {
  const sequenceRef = useRef(0);

  return useCallback((groupId: ClipGroupId): ClipGroupId | null => {
    const state = commands.getState();
    const sourceGroup = findClipHierarchyGroup(state.clipHierarchy, groupId);
    const sourceLocation = findClipHierarchyNodeLocation(
      state.clipHierarchy,
      { kind: "group", groupId },
    );

    if (sourceGroup === undefined || sourceLocation === null) {
      return null;
    }

    const sourceClipIds = getClipPlaybackOrder(sourceGroup.children);
    const duplicatedGroupCount = countClipGroups([sourceGroup]);

    if (
      Object.keys(state.clipsById).length + sourceClipIds.length
        > MAXIMUM_PROJECT_CLIP_COUNT
      || countClipGroups(state.clipHierarchy) + duplicatedGroupCount
        > MAXIMUM_CLIP_GROUP_COUNT
    ) {
      return null;
    }

    const reservedIds = new Set([
      ...Object.keys(state.clipsById),
      ...collectGroupIds(state.clipHierarchy),
    ]);
    const clipIdMap = new Map<ClipId, ClipId>();
    const groupIdMap = new Map<ClipGroupId, ClipGroupId>();

    for (const sourceClipId of sourceClipIds) {
      clipIdMap.set(sourceClipId, createUniqueId("clip", reservedIds, sequenceRef));
    }
    mapDuplicatedGroupIds(sourceGroup, groupIdMap, reservedIds, sequenceRef);

    const duplicatedRootId = groupIdMap.get(sourceGroup.id);
    if (duplicatedRootId === undefined) {
      return null;
    }

    const pendingCommands: PianoRollCommand[] = [];

    for (const sourceClipId of sourceClipIds) {
      const sourceClip = state.clipsById[sourceClipId];
      const duplicatedClipId = clipIdMap.get(sourceClipId);

      if (sourceClip === undefined || duplicatedClipId === undefined) {
        return null;
      }

      pendingCommands.push({
        type: "AddClip",
        clip: duplicateClipValue(sourceClip, duplicatedClipId, sourceClip.name),
      });
    }

    pendingCommands.push({
      type: "CreateClipGroup",
      groupId: duplicatedRootId,
      name: createCopyName(sourceGroup.name),
      color: sourceGroup.color,
      bypassEnabled: sourceGroup.bypassEnabled,
      parentGroupId: sourceLocation.parentGroupId,
      index: sourceLocation.index + 1,
    });
    appendDuplicatedChildren(
      sourceGroup,
      duplicatedRootId,
      clipIdMap,
      groupIdMap,
      pendingCommands,
    );

    for (const [sourceClipId, duplicatedClipId] of clipIdMap) {
      duplicateEditorState(sourceClipId, duplicatedClipId);
    }

    beginClipChange();
    if (commands.dispatch(pendingCommands, "Duplicate clip group") === null) {
      return null;
    }

    const firstDuplicatedClipId = sourceClipIds[0] === undefined
      ? undefined
      : clipIdMap.get(sourceClipIds[0]);
    if (firstDuplicatedClipId !== undefined) {
      commands.selectClip(firstDuplicatedClipId);
    }

    return duplicatedRootId;
  }, [beginClipChange, commands, duplicateEditorState]);
}

function appendDuplicatedChildren(
  sourceGroup: ClipHierarchyGroupNode,
  targetGroupId: ClipGroupId,
  clipIdMap: ReadonlyMap<ClipId, ClipId>,
  groupIdMap: ReadonlyMap<ClipGroupId, ClipGroupId>,
  commands: PianoRollCommand[],
): void {
  sourceGroup.children.forEach((node, index) => {
    if (node.kind === "clip") {
      const clipId = clipIdMap.get(node.clipId);
      if (clipId !== undefined) {
        commands.push({
          type: "MoveClipHierarchyNode",
          node: { kind: "clip", clipId },
          targetParentGroupId: targetGroupId,
          targetIndex: index,
        });
      }
      return;
    }

    const duplicatedGroupId = groupIdMap.get(node.id);
    if (duplicatedGroupId === undefined) {
      return;
    }

    commands.push({
      type: "CreateClipGroup",
      groupId: duplicatedGroupId,
      name: node.name,
      color: node.color,
      bypassEnabled: node.bypassEnabled,
      parentGroupId: targetGroupId,
      index,
    });
    appendDuplicatedChildren(
      node,
      duplicatedGroupId,
      clipIdMap,
      groupIdMap,
      commands,
    );
  });
}

function mapDuplicatedGroupIds(
  group: ClipHierarchyGroupNode,
  groupIdMap: Map<ClipGroupId, ClipGroupId>,
  reservedIds: Set<string>,
  sequenceRef: { current: number },
): void {
  groupIdMap.set(
    group.id,
    createUniqueId("clip-group", reservedIds, sequenceRef),
  );

  for (const child of group.children) {
    if (child.kind === "group") {
      mapDuplicatedGroupIds(child, groupIdMap, reservedIds, sequenceRef);
    }
  }
}

function collectGroupIds(
  hierarchy: readonly ClipHierarchyNode[],
): ClipGroupId[] {
  const ids: ClipGroupId[] = [];

  for (const node of hierarchy) {
    if (node.kind === "group") {
      ids.push(node.id, ...collectGroupIds(node.children));
    }
  }

  return ids;
}

function createUniqueId(
  prefix: "clip" | "clip-group",
  reservedIds: Set<string>,
  sequenceRef: { current: number },
): string {
  let id: string;

  do {
    sequenceRef.current += 1;
    id = typeof globalThis.crypto?.randomUUID === "function"
      ? `${prefix}-${globalThis.crypto.randomUUID()}`
      : `${prefix}-${Date.now()}-${sequenceRef.current}`;
  } while (reservedIds.has(id));

  reservedIds.add(id);
  return id;
}

function createCopyName(name: string): string {
  const suffix = " Copy";
  return `${name.slice(
    0,
    MAXIMUM_CLIP_GROUP_NAME_LENGTH - suffix.length,
  )}${suffix}`;
}
