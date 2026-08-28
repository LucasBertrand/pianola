import {
  DEFAULT_CLIP_GROUP_BYPASS_ENABLED,
  findClipHierarchyGroup,
  getClipPlaybackOrder,
  type ClipHierarchyNode,
} from "../clips/clip-hierarchy";
import { MAXIMUM_CLIP_NAME_LENGTH } from "../clips/clip";
import type { EditorSessionState } from "../project/project-document";
import type {
  CreateClipGroupCommand,
  DeleteClipGroupCommand,
  UngroupClipGroupCommand,
  UpdateClipGroupCommand,
} from "./command-types";
import { omitRecordKey, reject } from "./command-context";
import {
  assertHierarchy,
  isHexColor,
  isValidInsertionIndex,
} from "./clip-command-invariants";
import {
  insertIntoParent,
  removeGroup,
  unwrapGroup,
  updateGroup,
} from "./clip-hierarchy-command-transforms";

export function applyCreateClipGroup(
  state: EditorSessionState,
  command: CreateClipGroupCommand,
): EditorSessionState {
  const name = command.name.trim();
  const color = command.color;
  const bypassEnabled = command.bypassEnabled
    ?? DEFAULT_CLIP_GROUP_BYPASS_ENABLED;

  if (name.length === 0 || name.length > MAXIMUM_CLIP_NAME_LENGTH) {
    reject(
      "INVALID_COMMAND",
      `Clip group name must contain between 1 and ${MAXIMUM_CLIP_NAME_LENGTH} characters.`,
      command.type,
    );
  }

  if (!isHexColor(color)) {
    reject(
      "INVALID_COMMAND",
      "Clip group color must use the #RRGGBB format.",
      command.type,
    );
  }

  if (typeof bypassEnabled !== "boolean") {
    reject("INVALID_COMMAND", "Clip group bypass must be a boolean.", command.type);
  }

  if (!isValidInsertionIndex(command.index)) {
    reject("INVALID_COMMAND", "Clip group insertion index is invalid.", command.type);
  }

  if (findClipHierarchyGroup(state.clipHierarchy, command.groupId) !== undefined) {
    reject("INVALID_COMMAND", `Clip group "${command.groupId}" already exists.`, command.type);
  }

  const group: ClipHierarchyNode = {
    kind: "group",
    id: command.groupId,
    name,
    color,
    bypassEnabled,
    children: [],
  };
  const hierarchy = insertIntoParent(
    state.clipHierarchy,
    command.parentGroupId,
    command.index,
    group,
  );

  if (hierarchy === null) {
    reject("INVALID_COMMAND", "Target clip group does not exist.", command.type);
  }

  assertHierarchy(hierarchy, state, command.type);
  return { ...state, clipHierarchy: hierarchy };
}

export function applyUpdateClipGroup(
  state: EditorSessionState,
  command: UpdateClipGroupCommand,
): EditorSessionState {
  const group = findClipHierarchyGroup(state.clipHierarchy, command.groupId);

  if (group === undefined) {
    reject("INVALID_COMMAND", `Clip group "${command.groupId}" does not exist.`, command.type);
  }

  const name = command.changes.name?.trim() ?? group.name;
  const color = command.changes.color ?? group.color;
  const bypassEnabled = command.changes.bypassEnabled ?? group.bypassEnabled;

  if (name.length === 0 || name.length > MAXIMUM_CLIP_NAME_LENGTH) {
    reject(
      "INVALID_COMMAND",
      `Clip group name must contain between 1 and ${MAXIMUM_CLIP_NAME_LENGTH} characters.`,
      command.type,
    );
  }


  if (!isHexColor(color)) {
    reject(
      "INVALID_COMMAND",
      "Clip group color must use the #RRGGBB format.",
      command.type,
    );
  }


  if (typeof bypassEnabled !== "boolean") {
    reject("INVALID_COMMAND", "Clip group bypass must be a boolean.", command.type);
  }

  if (
    name === group.name
    && color === group.color
    && bypassEnabled === group.bypassEnabled
  ) {
    return state;
  }

  const hierarchy = updateGroup(
    state.clipHierarchy,
    command.groupId,
    name,
    color,
    bypassEnabled,
  );

  if (hierarchy === null) {
    reject("INVALID_COMMAND", `Clip group "${command.groupId}" does not exist.`, command.type);
  }

  return { ...state, clipHierarchy: hierarchy };
}

export function applyUngroupClipGroup(
  state: EditorSessionState,
  command: UngroupClipGroupCommand,
): EditorSessionState {
  const hierarchy = unwrapGroup(state.clipHierarchy, command.groupId);

  if (hierarchy === null) {
    reject("INVALID_COMMAND", `Clip group "${command.groupId}" does not exist.`, command.type);
  }

  return { ...state, clipHierarchy: hierarchy };
}

export function applyDeleteClipGroup(
  state: EditorSessionState,
  command: DeleteClipGroupCommand,
): EditorSessionState {
  const group = findClipHierarchyGroup(state.clipHierarchy, command.groupId);

  if (group === undefined) {
    reject("INVALID_COMMAND", `Clip group "${command.groupId}" does not exist.`, command.type);
  }

  const descendantClipIds = getClipPlaybackOrder(group.children);

  if (descendantClipIds.length >= Object.keys(state.clipsById).length) {
    reject(
      "INVALID_COMMAND",
      "A project must contain at least one clip.",
      command.type,
    );
  }

  const hierarchy = removeGroup(state.clipHierarchy, command.groupId);

  if (hierarchy === null) {
    reject("INVALID_COMMAND", `Clip group "${command.groupId}" does not exist.`, command.type);
  }

  let clipsById = state.clipsById;

  for (const clipId of descendantClipIds) {
    clipsById = omitRecordKey(clipsById, clipId);
  }

  return { ...state, clipsById, clipHierarchy: hierarchy };
}
