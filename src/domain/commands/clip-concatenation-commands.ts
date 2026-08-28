import {
  findClipHierarchyGroup,
  getClipPlaybackOrder,
  type ClipHierarchyNode,
} from "../clips/clip-hierarchy";
import type { ClipId } from "../identifiers";
import { MAXIMUM_PROJECT_CLIP_COUNT } from "../clips/clip";
import type { EditorSessionState } from "../project/project-document";
import type {
  ConcatenateClipGroupCommand,
  SplitClipIntoGroupCommand,
} from "./command-types";
import { hasOwn, omitRecordKey, reject } from "./command-context";
import { assertHierarchy, assertValidClip } from "./clip-command-invariants";
import {
  replaceClipWithGroup,
  replaceGroupWithClip,
} from "./clip-hierarchy-command-transforms";

export function applyConcatenateClipGroup(
  state: EditorSessionState,
  command: ConcatenateClipGroupCommand,
): EditorSessionState {
  const group = findClipHierarchyGroup(state.clipHierarchy, command.groupId);

  if (group === undefined) {
    reject(
      "INVALID_COMMAND",
      `Clip group "${command.groupId}" does not exist.`,
      command.type,
    );
  }

  const descendantClipIds = getClipPlaybackOrder(group.children);

  if (descendantClipIds.length === 0) {
    reject(
      "INVALID_COMMAND",
      "An empty clip group cannot be concatenated.",
      command.type,
    );
  }

  if (hasOwn(state.clipsById, command.clip.id)) {
    reject(
      "INVALID_COMMAND",
      `Clip "${command.clip.id}" already exists.`,
      command.type,
    );
  }

  assertValidClip(state, command.clip, command.type);

  let clipsById = state.clipsById;

  for (const clipId of descendantClipIds) {
    clipsById = omitRecordKey(clipsById, clipId);
  }

  clipsById = {
    ...clipsById,
    [command.clip.id]: command.clip,
  };
  const clipHierarchy = replaceGroupWithClip(
    state.clipHierarchy,
    command.groupId,
    command.clip.id,
  );

  if (clipHierarchy === null) {
    reject(
      "INVALID_COMMAND",
      `Clip group "${command.groupId}" does not exist.`,
      command.type,
    );
  }

  const nextState = { ...state, clipsById, clipHierarchy };

  assertHierarchy(clipHierarchy, nextState, command.type);
  return nextState;
}

export function applySplitClipIntoGroup(
  state: EditorSessionState,
  command: SplitClipIntoGroupCommand,
): EditorSessionState {
  const sourceClip = state.clipsById[command.sourceClipId];

  if (sourceClip === undefined) {
    reject(
      "INVALID_COMMAND",
      `Clip "${command.sourceClipId}" does not exist.`,
      command.type,
    );
  }

  if (command.clips.length < 2) {
    reject(
      "INVALID_COMMAND",
      "Splitting a clip into a group requires at least two generated clips.",
      command.type,
    );
  }

  if (
    Object.keys(state.clipsById).length - 1 + command.clips.length
    > MAXIMUM_PROJECT_CLIP_COUNT
  ) {
    reject(
      "INVALID_COMMAND",
      `A project cannot contain more than ${MAXIMUM_PROJECT_CLIP_COUNT} clips.`,
      command.type,
    );
  }

  if (
    findClipHierarchyGroup(state.clipHierarchy, command.groupId) !== undefined
  ) {
    reject(
      "INVALID_COMMAND",
      `Clip group "${command.groupId}" already exists.`,
      command.type,
    );
  }

  const generatedClipIds = new Set<ClipId>();

  for (const clip of command.clips) {
    if (
      clip.id === command.sourceClipId
      || generatedClipIds.has(clip.id)
      || hasOwn(state.clipsById, clip.id)
    ) {
      reject(
        "INVALID_COMMAND",
        `Clip "${clip.id}" already exists or is not unique.`,
        command.type,
      );
    }

    assertValidClip(state, clip, command.type);
    generatedClipIds.add(clip.id);
  }

  const group: ClipHierarchyNode = {
    kind: "group",
    id: command.groupId,
    name: sourceClip.name,
    color: sourceClip.color,
    bypassEnabled: sourceClip.bypassEnabled,
    children: command.clips.map((clip) => ({
      kind: "clip" as const,
      clipId: clip.id,
    })),
  };
  const clipHierarchy = replaceClipWithGroup(
    state.clipHierarchy,
    command.sourceClipId,
    group,
  );

  if (clipHierarchy === null) {
    reject(
      "INVALID_COMMAND",
      `Clip "${command.sourceClipId}" does not exist in the hierarchy.`,
      command.type,
    );
  }

  let clipsById = omitRecordKey(state.clipsById, command.sourceClipId);

  for (const clip of command.clips) {
    clipsById = { ...clipsById, [clip.id]: clip };
  }

  const nextState = { ...state, clipsById, clipHierarchy };

  assertHierarchy(clipHierarchy, nextState, command.type);
  return nextState;
}
