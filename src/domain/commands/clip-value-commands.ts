import {
  containsClipGroups,
  createFlatClipHierarchy,
  getClipPlaybackOrder,
} from "../clips/clip-hierarchy";
import type { EditorSessionState } from "../project/project-document";
import {
  MAXIMUM_CLIP_NAME_LENGTH,
  MAXIMUM_PROJECT_CLIP_COUNT,
} from "../clips/clip";
import type {
  AddClipCommand,
  DeleteClipCommand,
  RenameClipCommand,
  ReorderClipsCommand,
  UpdateClipCommand,
} from "./command-types";
import { hasOwn, omitRecordKey, reject } from "./command-context";
import { assertValidClip } from "./clip-command-invariants";
import { removeClipAndEmptyGroups } from "./clip-hierarchy-command-transforms";

export function applyAddClip(
  state: EditorSessionState,
  command: AddClipCommand,
): EditorSessionState {
  if (Object.keys(state.clipsById).length >= MAXIMUM_PROJECT_CLIP_COUNT) {
    reject(
      "INVALID_COMMAND",
      `A project cannot contain more than ${MAXIMUM_PROJECT_CLIP_COUNT} clips.`,
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

  return {
    ...state,
    clipsById: {
      ...state.clipsById,
      [command.clip.id]: command.clip,
    },
    clipHierarchy: [
      ...state.clipHierarchy,
      { kind: "clip", clipId: command.clip.id },
    ],
  };
}

export function applyDeleteClip(
  state: EditorSessionState,
  command: DeleteClipCommand,
): EditorSessionState {
  if (state.clipsById[command.clipId] === undefined) {
    reject(
      "INVALID_COMMAND",
      `Clip "${command.clipId}" does not exist.`,
      command.type,
    );
  }

  if (Object.keys(state.clipsById).length <= 1) {
    reject(
      "INVALID_COMMAND",
      "A project must contain at least one clip.",
      command.type,
    );
  }

  const clipsById = omitRecordKey(state.clipsById, command.clipId);
  return {
    ...state,
    clipsById,
    clipHierarchy: removeClipAndEmptyGroups(
      state.clipHierarchy,
      command.clipId,
    ),
  };
}

export function applyReorderClips(
  state: EditorSessionState,
  command: ReorderClipsCommand,
): EditorSessionState {
  const currentOrder = getClipPlaybackOrder(state.clipHierarchy);
  const currentIds = new Set(currentOrder);
  const requestedIds = new Set(command.clipOrder);

  if (
    containsClipGroups(state.clipHierarchy)
    || requestedIds.size !== command.clipOrder.length
    || requestedIds.size !== currentIds.size
    || [...currentIds].some((clipId) => !requestedIds.has(clipId))
  ) {
    reject(
      "INVALID_COMMAND",
      "Clip order must contain every top-level clip exactly once.",
      command.type,
    );
  }

  return {
    ...state,
    clipHierarchy: createFlatClipHierarchy(command.clipOrder),
  };
}

export function applyRenameClip(
  state: EditorSessionState,
  command: RenameClipCommand,
): EditorSessionState {
  const clip = state.clipsById[command.clipId];
  const name = command.name.trim();

  if (clip === undefined) {
    reject(
      "INVALID_COMMAND",
      `Clip "${command.clipId}" does not exist.`,
      command.type,
    );
  }

  if (name.length === 0 || name.length > MAXIMUM_CLIP_NAME_LENGTH) {
    reject(
      "INVALID_COMMAND",
      `Clip name must contain between 1 and ${MAXIMUM_CLIP_NAME_LENGTH} characters.`,
      command.type,
    );
  }

  if (name === clip.name) {
    return state;
  }

  return {
    ...state,
    clipsById: {
      ...state.clipsById,
      [clip.id]: {
        ...clip,
        name,
      },
    },
  };
}

export function applyUpdateClip(
  state: EditorSessionState,
  command: UpdateClipCommand,
): EditorSessionState {
  const clip = state.clipsById[command.clipId];

  if (clip === undefined) {
    reject(
      "INVALID_COMMAND",
      `Clip "${command.clipId}" does not exist.`,
      command.type,
    );
  }

  const name = command.changes.name?.trim() ?? clip.name;
  const color = command.changes.color ?? clip.color;
  const bypassEnabled = command.changes.bypassEnabled ?? clip.bypassEnabled;

  if (typeof bypassEnabled !== "boolean") {
    reject(
      "INVALID_COMMAND",
      "Clip bypass must be a boolean.",
      command.type,
    );
  }

  if (name.length === 0 || name.length > MAXIMUM_CLIP_NAME_LENGTH) {
    reject(
      "INVALID_COMMAND",
      `Clip name must contain between 1 and ${MAXIMUM_CLIP_NAME_LENGTH} characters.`,
      command.type,
    );
  }

  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    reject(
      "INVALID_COMMAND",
      "Clip color must use the #RRGGBB format.",
      command.type,
    );
  }

  if (
    name === clip.name
    && color === clip.color
    && bypassEnabled === clip.bypassEnabled
  ) {
    return state;
  }

  return {
    ...state,
    clipsById: {
      ...state.clipsById,
      [clip.id]: {
        ...clip,
        name,
        color,
        bypassEnabled,
      },
    },
  };
}
