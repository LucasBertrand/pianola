import {
  type Clip,
} from "../clips/clip";
import {
  assertValidClipHierarchy,
  containsClipGroups,
  createFlatClipHierarchy,
  DEFAULT_CLIP_GROUP_BYPASS_ENABLED,
  findClipHierarchyGroup,
  getClipPlaybackOrder,
  type ClipHierarchyNode,
} from "../clips/clip-hierarchy";
import {
  type Note,
} from "../notes/note";
import {
  type ClipId,
  type ClipGroupId,
  type NoteId,
} from "../identifiers";
import {
  type ProjectState,
} from "../project/project-document";
import {
  MAXIMUM_CLIP_NAME_LENGTH,
  MAXIMUM_PROJECT_CLIP_COUNT,
} from "../clips/clip";
import {
  MAXIMUM_CLIP_NOTE_COUNT,
} from "../notes/note";
import {
  assertValidNoteForTrack,
} from "../validation/note-validation";
import {
  assertValidClipTimeline,
  assertValidTransportState,
} from "../validation/transport-validation";
import type {
  AddClipCommand,
  ConcatenateClipGroupCommand,
  CreateClipGroupCommand,
  DeleteClipCommand,
  DeleteClipGroupCommand,
  MoveClipHierarchyNodeCommand,
  PianoRollCommand,
  RenameClipCommand,
  ReorderClipsCommand,
  UpdateClipCommand,
  UpdateClipGroupCommand,
  UngroupClipGroupCommand,
} from "./command-types";
import { notesOverlapInInstrument } from "./active-clip-command-helpers";
import { hasOwn, omitRecordKey, reject } from "./command-context";

export function applyAddClip(
  state: ProjectState,
  command: AddClipCommand,
): ProjectState {
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
  state: ProjectState,
  command: DeleteClipCommand,
): ProjectState {
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
  state: ProjectState,
  command: ReorderClipsCommand,
): ProjectState {
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

export function applyCreateClipGroup(
  state: ProjectState,
  command: CreateClipGroupCommand,
): ProjectState {
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
  state: ProjectState,
  command: UpdateClipGroupCommand,
): ProjectState {
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
  state: ProjectState,
  command: UngroupClipGroupCommand,
): ProjectState {
  const hierarchy = unwrapGroup(state.clipHierarchy, command.groupId);

  if (hierarchy === null) {
    reject("INVALID_COMMAND", `Clip group "${command.groupId}" does not exist.`, command.type);
  }

  return { ...state, clipHierarchy: hierarchy };
}

export function applyDeleteClipGroup(
  state: ProjectState,
  command: DeleteClipGroupCommand,
): ProjectState {
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

export function applyConcatenateClipGroup(
  state: ProjectState,
  command: ConcatenateClipGroupCommand,
): ProjectState {
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

export function applyMoveClipHierarchyNode(
  state: ProjectState,
  command: MoveClipHierarchyNodeCommand,
): ProjectState {
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

export function applyRenameClip(
  state: ProjectState,
  command: RenameClipCommand,
): ProjectState {
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
  state: ProjectState,
  command: UpdateClipCommand,
): ProjectState {
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

function assertValidClip(
  state: ProjectState,
  clip: Clip,
  commandType: PianoRollCommand["type"],
): void {
  if (
    clip.id.length === 0
    || clip.name.trim().length === 0
    || clip.name.length > MAXIMUM_CLIP_NAME_LENGTH
    || !/^#[0-9a-f]{6}$/i.test(clip.color)
    || typeof clip.bypassEnabled !== "boolean"
  ) {
    reject("INVALID_COMMAND", "Clip identity is invalid.", commandType);
  }

  assertValidClipTimeline(clip.timeline, state.clock);
  assertValidTransportState(clip.transportSettings);
  const durationTicks = clip.timeline.durationTicks;

  const trackIds = Object.keys(clip.tracksByInstrumentId);

  if (
    trackIds.length !== state.instrumentOrder.length
    || trackIds.some(
      (instrumentId) => state.projectInstrumentsById[instrumentId] === undefined,
    )
  ) {
    reject(
      "INVALID_COMMAND",
      `Clip "${clip.id}" must contain exactly one track per project instrument.`,
      commandType,
    );
  }

  if (clip.transportSettings.loop.endTick > durationTicks) {
    reject(
      "INVALID_COMMAND",
      `Clip "${clip.id}" transport exceeds its duration.`,
      commandType,
    );
  }

  const noteIds = new Set<NoteId>();
  let noteCount = 0;

  for (const instrumentId of state.instrumentOrder) {
    const track = clip.tracksByInstrumentId[instrumentId];

    if (track === undefined || track.instrumentId !== instrumentId) {
      reject(
        "INVALID_COMMAND",
        `Clip "${clip.id}" must contain a track for instrument "${instrumentId}".`,
        commandType,
      );
    }

    const notes = Object.values(track.notesById);
    noteCount += notes.length;
    notes.sort(compareNotesForOverlapValidation);

    for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
      const note = notes[noteIndex];

      if (note === undefined) {
        continue;
      }

      assertValidNoteForTrack(note, instrumentId);

      if (
        track.notesById[note.id] !== note
        || noteIds.has(note.id)
        || note.startTick + note.durationTicks > durationTicks
      ) {
        reject(
          "INVALID_COMMAND",
          `Clip "${clip.id}" contains an invalid or duplicate note.`,
          commandType,
        );
      }

      const previousNote = notes[noteIndex - 1];

      if (
        previousNote !== undefined
        && notesOverlapInInstrument(previousNote, note)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Clip "${clip.id}" contains overlapping notes.`,
          commandType,
        );
      }

      noteIds.add(note.id);
    }
  }

  if (noteCount > MAXIMUM_CLIP_NOTE_COUNT) {
    reject(
      "INVALID_COMMAND",
      `Clip "${clip.id}" exceeds the note limit.`,
      commandType,
    );
  }
}

function compareNotesForOverlapValidation(left: Note, right: Note): number {
  return (
    left.pitch - right.pitch
    || left.startTick - right.startTick
    || left.durationTicks - right.durationTicks
    || left.id.localeCompare(right.id)
  );
}

function assertHierarchy(
  hierarchy: readonly ClipHierarchyNode[],
  state: ProjectState,
  commandType: PianoRollCommand["type"],
): void {
  try {
    assertValidClipHierarchy(hierarchy, new Set(Object.keys(state.clipsById)));
  } catch (error: unknown) {
    reject(
      "INVALID_COMMAND",
      error instanceof Error ? error.message : "Clip hierarchy is invalid.",
      commandType,
    );
  }
}

function isValidInsertionIndex(index: number): boolean {
  return Number.isSafeInteger(index) && index >= 0;
}

function insertIntoParent(
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

function updateGroup(
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

function isHexColor(color: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(color);
}

function unwrapGroup(
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

function removeGroup(
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

function replaceGroupWithClip(
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

function removeClipAndEmptyGroups(
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

function groupContainsGroup(
  hierarchy: readonly ClipHierarchyNode[],
  groupId: ClipGroupId,
  descendantGroupId: ClipGroupId,
): boolean {
  const group = findClipHierarchyGroup(hierarchy, groupId);

  return group !== undefined
    && findClipHierarchyGroup(group.children, descendantGroupId) !== undefined;
}

function removeNode(
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

function matchesReference(
  node: ClipHierarchyNode,
  reference: MoveClipHierarchyNodeCommand["node"],
): boolean {
  return reference.kind === "clip"
    ? node.kind === "clip" && node.clipId === reference.clipId
    : node.kind === "group" && node.id === reference.groupId;
}
