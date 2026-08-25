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
export const DEFAULT_CLIP_GROUP_COLOR =
  PROJECT_CONSTANTS.defaultClipGroupColor;
export const DEFAULT_CLIP_GROUP_BYPASS_ENABLED =
  PROJECT_CONSTANTS.defaultClipGroupBypassEnabled;

export interface ClipHierarchyClipNode {
  readonly kind: "clip";
  readonly clipId: ClipId;
}

export interface ClipHierarchyGroupNode {
  readonly kind: "group";
  readonly id: ClipGroupId;
  readonly name: string;
  readonly color: string;
  readonly bypassEnabled: boolean;
  readonly children: readonly ClipHierarchyNode[];
}

export type ClipHierarchyNode =
  | ClipHierarchyClipNode
  | ClipHierarchyGroupNode;

export type ClipHierarchyNodeIdentity =
  | { readonly kind: "clip"; readonly clipId: ClipId }
  | { readonly kind: "group"; readonly groupId: ClipGroupId };

export interface ClipHierarchyNodeLocation {
  readonly parentGroupId: ClipGroupId | null;
  readonly index: number;
}

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

export function findClipHierarchyNodeLocation(
  hierarchy: readonly ClipHierarchyNode[],
  identity: ClipHierarchyNodeIdentity,
  parentGroupId: ClipGroupId | null = null,
): ClipHierarchyNodeLocation | null {
  for (let index = 0; index < hierarchy.length; index += 1) {
    const node = hierarchy[index];

    if (node === undefined) {
      continue;
    }

    if (
      (identity.kind === "clip"
        && node.kind === "clip"
        && node.clipId === identity.clipId)
      || (identity.kind === "group"
        && node.kind === "group"
        && node.id === identity.groupId)
    ) {
      return { parentGroupId, index };
    }

    if (node.kind === "group") {
      const descendant = findClipHierarchyNodeLocation(
        node.children,
        identity,
        node.id,
      );

      if (descendant !== null) {
        return descendant;
      }
    }
  }

  return null;
}

export function getClipGroupChildren(
  hierarchy: readonly ClipHierarchyNode[],
  groupId: ClipGroupId | null,
): readonly ClipHierarchyNode[] | null {
  if (groupId === null) {
    return hierarchy;
  }

  for (const node of hierarchy) {
    if (node.kind !== "group") {
      continue;
    }

    if (node.id === groupId) {
      return node.children;
    }

    const children = getClipGroupChildren(node.children, groupId);

    if (children !== null) {
      return children;
    }
  }

  return null;
}

export function findClipHierarchyGroup(
  hierarchy: readonly ClipHierarchyNode[],
  groupId: ClipGroupId,
): ClipHierarchyGroupNode | undefined {
  for (const node of hierarchy) {
    if (node.kind !== "group") {
      continue;
    }

    if (node.id === groupId) {
      return node;
    }

    const descendant = findClipHierarchyGroup(node.children, groupId);

    if (descendant !== undefined) {
      return descendant;
    }
  }

  return undefined;
}

export function countDescendantClips(node: ClipHierarchyNode): number {
  return node.kind === "clip"
    ? 1
    : node.children.reduce(
        (count, child) => count + countDescendantClips(child),
        0,
      );
}

export function countClipGroups(
  hierarchy: readonly ClipHierarchyNode[],
): number {
  return hierarchy.reduce(
    (count, node) => count + (node.kind === "group"
      ? 1 + countClipGroups(node.children)
      : 0),
    0,
  );
}

/** Returns leaves ignored because at least one containing group is bypassed. */
export function getGroupBypassedClipIds(
  hierarchy: readonly ClipHierarchyNode[],
): ReadonlySet<ClipId> {
  const clipIds = new Set<ClipId>();

  collectGroupBypassedClipIds(hierarchy, false, clipIds);
  return clipIds;
}

export function getFirstDescendantClipId(
  node: ClipHierarchyNode,
): ClipId | null {
  if (node.kind === "clip") {
    return node.clipId;
  }

  for (const child of node.children) {
    const clipId = getFirstDescendantClipId(child);

    if (clipId !== null) {
      return clipId;
    }
  }

  return null;
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
    || !/^#[0-9a-f]{6}$/i.test(node.color)
    || typeof node.bypassEnabled !== "boolean"
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

function collectGroupBypassedClipIds(
  hierarchy: readonly ClipHierarchyNode[],
  ancestorBypassed: boolean,
  clipIds: Set<ClipId>,
): void {
  for (const node of hierarchy) {
    if (node.kind === "clip") {
      if (ancestorBypassed) {
        clipIds.add(node.clipId);
      }
      continue;
    }

    collectGroupBypassedClipIds(
      node.children,
      ancestorBypassed || node.bypassEnabled,
      clipIds,
    );
  }
}

function isValidId(value: string): boolean {
  return value.trim().length > 0 && value.length <= MAXIMUM_ENTITY_ID_LENGTH;
}
