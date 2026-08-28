import {
  findClipHierarchyGroup,
  type ClipHierarchyNode,
} from "../clips/clip-hierarchy";
import type { ClipGroupId, ClipId } from "../identifiers";
import type { MoveClipHierarchyNodeCommand } from "./command-types";

export function insertIntoParent(
  hierarchy: readonly ClipHierarchyNode[],
  parentGroupId: ClipGroupId | null,
  index: number,
  node: ClipHierarchyNode,
): readonly ClipHierarchyNode[] | null {
  if (parentGroupId === null) {
    if (index > hierarchy.length) {
      return null;
    }

    const next = [...hierarchy];
    next.splice(index, 0, node);
    return next;
  }

  let found = false;
  const next = hierarchy.map((candidate) => {
    if (candidate.kind !== "group") {
      return candidate;
    }

    if (candidate.id === parentGroupId) {
      if (index > candidate.children.length) {
        return candidate;
      }

      found = true;
      const children = [...candidate.children];
      children.splice(index, 0, node);
      return { ...candidate, children };
    }

    const children = insertIntoParent(candidate.children, parentGroupId, index, node);

    if (children === null) {
      return candidate;
    }

    found = true;
    return { ...candidate, children };
  });

  return found ? next : null;
}

export function updateGroup(
  hierarchy: readonly ClipHierarchyNode[],
  groupId: ClipGroupId,
  name: string,
  color: string,
  bypassEnabled: boolean,
): readonly ClipHierarchyNode[] | null {
  let found = false;
  const next = hierarchy.map((node) => {
    if (node.kind !== "group") {
      return node;
    }

    if (node.id === groupId) {
      found = true;
      return { ...node, name, color, bypassEnabled };
    }

    const children = updateGroup(
      node.children,
      groupId,
      name,
      color,
      bypassEnabled,
    );

    if (children === null) {
      return node;
    }

    found = true;
    return { ...node, children };
  });

  return found ? next : null;
}

export function unwrapGroup(
  hierarchy: readonly ClipHierarchyNode[],
  groupId: ClipGroupId,
): readonly ClipHierarchyNode[] | null {
  let found = false;
  const next: ClipHierarchyNode[] = [];

  for (const node of hierarchy) {
    if (node.kind === "group" && node.id === groupId) {
      next.push(...node.children);
      found = true;
      continue;
    }

    if (node.kind === "group") {
      const children = unwrapGroup(node.children, groupId);

      if (children !== null) {
        next.push({ ...node, children });
        found = true;
        continue;
      }
    }

    next.push(node);
  }

  return found ? next : null;
}

export function removeGroup(
  hierarchy: readonly ClipHierarchyNode[],
  groupId: ClipGroupId,
): readonly ClipHierarchyNode[] | null {
  let found = false;
  const next: ClipHierarchyNode[] = [];

  for (const node of hierarchy) {
    if (node.kind === "group" && node.id === groupId) {
      found = true;
      continue;
    }

    if (node.kind !== "group") {
      next.push(node);
      continue;
    }

    const children = removeGroup(node.children, groupId);

    if (children === null) {
      next.push(node);
    } else {
      found = true;
      next.push({ ...node, children });
    }
  }

  return found ? next : null;
}

export function replaceGroupWithClip(
  hierarchy: readonly ClipHierarchyNode[],
  groupId: ClipGroupId,
  clipId: ClipId,
): readonly ClipHierarchyNode[] | null {
  let found = false;
  const next = hierarchy.map((node): ClipHierarchyNode => {
    if (node.kind !== "group") {
      return node;
    }

    if (node.id === groupId) {
      found = true;
      return { kind: "clip", clipId };
    }

    const children = replaceGroupWithClip(node.children, groupId, clipId);

    if (children === null) {
      return node;
    }

    found = true;
    return { ...node, children };
  });

  return found ? next : null;
}

export function replaceClipWithGroup(
  hierarchy: readonly ClipHierarchyNode[],
  clipId: ClipId,
  group: ClipHierarchyNode,
): readonly ClipHierarchyNode[] | null {
  let found = false;
  const next = hierarchy.map((node): ClipHierarchyNode => {
    if (node.kind === "clip") {
      if (node.clipId === clipId) {
        found = true;
        return group;
      }

      return node;
    }

    const children = replaceClipWithGroup(node.children, clipId, group);

    if (children === null) {
      return node;
    }

    found = true;
    return { ...node, children };
  });

  return found ? next : null;
}

export function removeClipAndEmptyGroups(
  hierarchy: readonly ClipHierarchyNode[],
  clipId: ClipId,
): readonly ClipHierarchyNode[] {
  const next: ClipHierarchyNode[] = [];

  for (const node of hierarchy) {
    if (node.kind === "clip") {
      if (node.clipId !== clipId) {
        next.push(node);
      }
      continue;
    }

    const children = removeClipAndEmptyGroups(node.children, clipId);

    if (children.length > 0) {
      next.push({ ...node, children });
    }
  }

  return next;
}

export function groupContainsGroup(
  hierarchy: readonly ClipHierarchyNode[],
  groupId: ClipGroupId,
  descendantGroupId: ClipGroupId,
): boolean {
  const group = findClipHierarchyGroup(hierarchy, groupId);

  return group !== undefined
    && findClipHierarchyGroup(group.children, descendantGroupId) !== undefined;
}

export function removeNode(
  hierarchy: readonly ClipHierarchyNode[],
  reference: MoveClipHierarchyNodeCommand["node"],
): { readonly hierarchy: readonly ClipHierarchyNode[]; readonly node: ClipHierarchyNode } | null {
  const next: ClipHierarchyNode[] = [];

  for (const node of hierarchy) {
    if (matchesReference(node, reference)) {
      return {
        hierarchy: [...next, ...hierarchy.slice(next.length + 1)],
        node,
      };
    }

    if (node.kind === "group") {
      const removed = removeNode(node.children, reference);

      if (removed !== null) {
        return {
          hierarchy: [
            ...next,
            { ...node, children: removed.hierarchy },
            ...hierarchy.slice(next.length + 1),
          ],
          node: removed.node,
        };
      }
    }

    next.push(node);
  }

  return null;
}

export function matchesReference(
  node: ClipHierarchyNode,
  reference: MoveClipHierarchyNodeCommand["node"],
): boolean {
  return reference.kind === "clip"
    ? node.kind === "clip" && node.clipId === reference.clipId
    : node.kind === "group" && node.id === reference.groupId;
}
