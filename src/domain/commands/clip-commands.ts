import {
  type Clip,
} from "../clips/clip";
import {
  type Note,
} from "../notes/note";
import {
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
  DeleteClipCommand,
  PianoRollCommand,
  RenameClipCommand,
  ReorderClipsCommand,
  UpdateClipCommand,
} from "./command-types";
import { assertValidClipInstrumentState } from "./instrument-commands";
import { notesOverlapInInstrument } from "./active-clip-command-helpers";
import { hasOwn, omitRecordKey, reject } from "./command-context";

export function applyAddClip(
  state: ProjectState,
  command: AddClipCommand,
): ProjectState {
  if (state.clipOrder.length >= MAXIMUM_PROJECT_CLIP_COUNT) {
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
    clipOrder: [...state.clipOrder, command.clip.id],
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

  if (state.clipOrder.length <= 1) {
    reject(
      "INVALID_COMMAND",
      "A project must contain at least one clip.",
      command.type,
    );
  }

  const clipOrder = state.clipOrder.filter(
    (clipId) => clipId !== command.clipId,
  );
  const clipsById = omitRecordKey(state.clipsById, command.clipId);
  return {
    ...state,
    clipsById,
    clipOrder,
  };
}

export function applyReorderClips(
  state: ProjectState,
  command: ReorderClipsCommand,
): ProjectState {
  const currentIds = new Set(state.clipOrder);
  const requestedIds = new Set(command.clipOrder);

  if (
    requestedIds.size !== command.clipOrder.length
    || requestedIds.size !== currentIds.size
    || [...currentIds].some((clipId) => !requestedIds.has(clipId))
  ) {
    reject(
      "INVALID_COMMAND",
      "Clip order must contain every clip exactly once.",
      command.type,
    );
  }

  return {
    ...state,
    clipOrder: [...command.clipOrder],
  };
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

  if (name === clip.name && color === clip.color) {
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
  ) {
    reject("INVALID_COMMAND", "Clip identity is invalid.", commandType);
  }

  assertValidClipTimeline(clip.timeline, state.clock);
  assertValidTransportState(clip.transportSettings);
  const durationTicks = clip.timeline.durationTicks;

  if (
    clip.instrumentStatesById === null
    || typeof clip.instrumentStatesById !== "object"
  ) {
    reject(
      "INVALID_COMMAND",
      `Clip "${clip.id}" must contain instrument state data.`,
      commandType,
    );
  }

  const trackIds = Object.keys(clip.tracksByInstrumentId);
  const instrumentStateIds = Object.keys(clip.instrumentStatesById);

  if (
    trackIds.length !== state.instrumentOrder.length
    || instrumentStateIds.length !== state.instrumentOrder.length
    || trackIds.some(
      (instrumentId) => state.projectInstrumentsById[instrumentId] === undefined,
    )
    || instrumentStateIds.some(
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
    const instrumentState = clip.instrumentStatesById[instrumentId];

    if (
      track === undefined
      || track.instrumentId !== instrumentId
      || instrumentState === undefined
    ) {
      reject(
        "INVALID_COMMAND",
        `Clip "${clip.id}" must contain a track and state for instrument "${instrumentId}".`,
        commandType,
      );
    }

    assertValidClipInstrumentState(
      instrumentState,
      commandType,
      `Clip "${clip.id}" instrument "${instrumentId}"`,
    );

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
