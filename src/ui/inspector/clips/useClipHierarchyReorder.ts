import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  ClipHierarchyNodeIdentity,
} from "../../../domain/clips/clip-hierarchy";
import type {
  ClipGroupId,
} from "../../../domain/identifiers";

const NODE_SELECTOR = "[data-clip-hierarchy-node]";

export interface ClipHierarchyMoveTarget {
  readonly parentGroupId: ClipGroupId | null;
  readonly index: number;
}

export interface ClipHierarchyReorderController {
  readonly begin: (
    identity: ClipHierarchyNodeIdentity,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
}

export function useClipHierarchyReorder(
  onMove: (
    identity: ClipHierarchyNodeIdentity,
    parentGroupId: ClipGroupId | null,
    index: number,
  ) => void,
): ClipHierarchyReorderController {
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const begin = useCallback((
    identity: ClipHierarchyNodeIdentity,
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }

    const handle = event.currentTarget;
    const sourceNode = handle.closest<HTMLElement>(NODE_SELECTOR);

    if (sourceNode === null) {
      return;
    }

    const pointerId = event.pointerId;
    const sourceParentId = readParentId(sourceNode);
    const sourceIndex = readIndex(sourceNode);
    let target: ClipHierarchyMoveTarget | null = null;

    if (sourceIndex === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handle.setPointerCapture(pointerId);
    sourceNode.classList.add("is-reordering");

    const clearTarget = (): void => {
      const list = sourceNode.closest(".clip-list");

      list?.querySelectorAll(
        ".is-reorder-target, .is-drop-inside",
      ).forEach((element) => {
        element.classList.remove("is-reorder-target", "is-drop-inside");
      });
    };

    const move = (pointerEvent: PointerEvent): void => {
      const pointed = document.elementFromPoint(
        pointerEvent.clientX,
        pointerEvent.clientY,
      );
      const targetNode = pointed?.closest<HTMLElement>(NODE_SELECTOR);

      if (
        targetNode === null
        || targetNode === undefined
        || targetNode === sourceNode
        || sourceNode.contains(targetNode)
      ) {
        clearTarget();
        target = null;
        return;
      }

      const targetIndex = readIndex(targetNode);

      if (targetIndex === null) {
        return;
      }

      clearTarget();
      const isGroup = targetNode.dataset["nodeKind"] === "group";
      const groupHeader = pointed?.closest(".clip-group-header");
      const isInside = isGroup
        && groupHeader !== null
        && groupHeader !== undefined
        && pointerEvent.clientX
          > targetNode.getBoundingClientRect().left + 36;

      if (isInside) {
        target = {
          parentGroupId: targetNode.dataset["nodeId"] ?? null,
          index: Number(targetNode.dataset["childCount"] ?? 0),
        };
        targetNode.classList.add("is-drop-inside");
        return;
      }

      const targetParentId = readParentId(targetNode);
      const rect = targetNode.getBoundingClientRect();
      let insertionIndex = targetIndex
        + (pointerEvent.clientY >= rect.top + rect.height / 2 ? 1 : 0);

      if (targetParentId === sourceParentId && sourceIndex < insertionIndex) {
        insertionIndex -= 1;
      }

      target = {
        parentGroupId: targetParentId,
        index: insertionIndex,
      };
      targetNode.classList.add("is-reorder-target");
    };

    const cleanup = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
      sourceNode.classList.remove("is-reordering");
      clearTarget();
    };

    const finish = (): void => {
      cleanup();

      if (
        target !== null
        && !(
          target.parentGroupId === sourceParentId
          && target.index === sourceIndex
        )
      ) {
        onMoveRef.current(identity, target.parentGroupId, target.index);
      }
    };

    const cancel = (): void => {
      target = null;
      cleanup();
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", cancel);
    handle.addEventListener("lostpointercapture", cancel);
  }, []);

  return { begin };
}

function readIndex(element: HTMLElement): number | null {
  const index = Number(element.dataset["nodeIndex"]);
  return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

function readParentId(element: HTMLElement): ClipGroupId | null {
  const value = element.dataset["parentGroupId"];
  return value === undefined || value.length === 0 ? null : value;
}
