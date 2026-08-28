import type { EditorSessionState } from "../project/project-document";
import type { MoveClipHierarchyNodeCommand } from "./command-types";
import { reject } from "./command-context";
import {
  assertHierarchy,
  isValidInsertionIndex,
} from "./clip-command-invariants";
import {
  groupContainsGroup,
  insertIntoParent,
  removeNode,
} from "./clip-hierarchy-command-transforms";

export function applyMoveClipHierarchyNode(
  state: EditorSessionState,
  command: MoveClipHierarchyNodeCommand,
): EditorSessionState {
  if (!isValidInsertionIndex(command.targetIndex)) {
    reject("INVALID_COMMAND", "Clip hierarchy insertion index is invalid.", command.type);
  }

  if (
    command.node.kind === "group"
    && command.targetParentGroupId !== null
    && groupContainsGroup(
      state.clipHierarchy,
      command.node.groupId,
      command.targetParentGroupId,
    )
  ) {
    reject("INVALID_COMMAND", "A clip group cannot be moved into one of its descendants.", command.type);
  }

  const removed = removeNode(state.clipHierarchy, command.node);

  if (removed === null) {
    reject("INVALID_COMMAND", "Clip hierarchy node does not exist.", command.type);
  }

  const hierarchy = insertIntoParent(
    removed.hierarchy,
    command.targetParentGroupId,
    command.targetIndex,
    removed.node,
  );

  if (hierarchy === null) {
    reject("INVALID_COMMAND", "Target clip group does not exist.", command.type);
  }

  assertHierarchy(hierarchy, state, command.type);
  return { ...state, clipHierarchy: hierarchy };
}
