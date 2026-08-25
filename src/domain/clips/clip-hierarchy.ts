import { PROJECT_CONSTANTS } from "../../config/domain-limits";
import {
  MAXIMUM_ENTITY_ID_LENGTH,
  type ClipGroupId,
  type ClipId,
} from "../identifiers";

export const MAXIMUM_CLIP_GROUP_NAME_LENGTH =
  PROJECT_CONSTANTS.maximumClipNameLength;
export const MAXIMUM_CLIP_GROUP_COUNT =
  PROJECT_CONSTANTS.maximumClipGroupCount;
export const MAXIMUM_CLIP_GROUP_DEPTH =
  PROJECT_CONSTANTS.maximumClipGroupDepth;

export interface ClipHierarchyClipNode {
  readonly kind: "clip";
  readonly clipId: ClipId;
}

export interface ClipHierarchyGroupNode {
  readonly kind: "group";
  readonly id: ClipGroupId;
  readonly name: string;
  readonly children: readonly ClipHierarchyNode[];
}

export type ClipHierarchyNode =
  | ClipHierarchyClipNode
  | ClipHierarchyGroupNode;

/** Flattens the hierarchy into the deterministic project playback order. */
export function getClipPlaybackOrder(
  hierarchy: readonly ClipHierarchyNode[],
): readonly ClipId[] {
  const clipIds: ClipId[] = [];

  for (const node of hierarchy) {
    collectClipIds(node, clipIds);
  }

  return clipIds;
}

export function createFlatClipHierarchy(
  clipIds: readonly ClipId[],
): readonly ClipHierarchyNode[] {
  return clipIds.map((clipId) => ({ kind: "clip", clipId }));
}

export function assertValidClipHierarchy(
  hierarchy: readonly ClipHierarchyNode[],
  expectedClipIds: ReadonlySet<ClipId>,
): void {
  if (expectedClipIds.size === 0) {
    throw new Error("A project must contain at least one clip.");
  }

  const discoveredClipIds = new Set<ClipId>();
  const groupIds = new Set<ClipGroupId>();
  let groupCount = 0;

  for (const node of hierarchy) {
    validateNode(node, 1, discoveredClipIds, groupIds, () => {
      groupCount += 1;
    });
  }

  if (
    discoveredClipIds.size !== expectedClipIds.size
    || [...expectedClipIds].some((clipId) => !discoveredClipIds.has(clipId))
  ) {
    throw new Error(
      "Clip hierarchy must contain every project clip exactly once.",
    );
  }

  if (groupCount > MAXIMUM_CLIP_GROUP_COUNT) {
    throw new Error(
      `A project cannot contain more than ${MAXIMUM_CLIP_GROUP_COUNT} clip groups.`,
    );
  }
}

export function containsClipGroups(
  hierarchy: readonly ClipHierarchyNode[],
): boolean {
  return hierarchy.some((node) => node.kind === "group");
}

function collectClipIds(node: ClipHierarchyNode, clipIds: ClipId[]): void {
  if (node.kind === "clip") {
    clipIds.push(node.clipId);
    return;
  }

  for (const child of node.children) {
    collectClipIds(child, clipIds);
  }
}

function validateNode(
  node: ClipHierarchyNode,
  depth: number,
  discoveredClipIds: Set<ClipId>,
  groupIds: Set<ClipGroupId>,
  onGroup: () => void,
): void {
  if (node.kind === "clip") {
    if (
      !isValidId(node.clipId)
      || discoveredClipIds.has(node.clipId)
    ) {
      throw new Error("Clip hierarchy contains an invalid or duplicate clip ID.");
    }

    discoveredClipIds.add(node.clipId);
    return;
  }

  if (
    depth > MAXIMUM_CLIP_GROUP_DEPTH
    || !isValidId(node.id)
    || groupIds.has(node.id)
    || node.name.trim().length === 0
    || node.name.length > MAXIMUM_CLIP_GROUP_NAME_LENGTH
    || !Array.isArray(node.children)
  ) {
    throw new Error("Clip hierarchy contains an invalid group.");
  }

  groupIds.add(node.id);
  onGroup();

  for (const child of node.children) {
    validateNode(child, depth + 1, discoveredClipIds, groupIds, onGroup);
  }
}

function isValidId(value: string): boolean {
  return value.trim().length > 0 && value.length <= MAXIMUM_ENTITY_ID_LENGTH;
}
