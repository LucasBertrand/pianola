import type {
  Clip,
  ClipId,
  ClipInstrumentState,
  ProjectInstrument,
  ProjectState,
  Track,
} from "../model";
import { MAXIMUM_PROJECT_INSTRUMENT_COUNT } from "../model";
import { assertValidProjectInstrument } from "../validation/instrument-validation";
import type { ActiveClipProjectState } from "./active-clip-project-state";
import type {
  AddProjectInstrumentCommand,
  DeleteProjectInstrumentCommand,
  PianoRollCommand,
  ReorderProjectInstrumentsCommand,
  UpdateClipInstrumentStateCommand,
  UpdateProjectInstrumentCommand,
} from "./command-types";
import {
  hasOwn,
  omitRecordKey,
  reject,
  requireProjectInstrument,
} from "./command-context";

export function applyAddProjectInstrument(
  state: ProjectState,
  command: AddProjectInstrumentCommand,
): ProjectState {
  assertValidProjectInstrument(command.instrument);
  if (state.instrumentOrder.length >= MAXIMUM_PROJECT_INSTRUMENT_COUNT) {
    reject(
      "INVALID_COMMAND",
      `A project cannot contain more than ${MAXIMUM_PROJECT_INSTRUMENT_COUNT} instruments.`,
      command.type,
    );
  }

  if (hasOwn(state.projectInstrumentsById, command.instrument.id)) {
    reject(
      "INSTRUMENT_ALREADY_EXISTS",
      `ProjectInstrument "${command.instrument.id}" already exists.`,
      command.type,
    );
  }

  const requestedClipIds = Object.keys(command.clipInstrumentStatesById);

  if (
    requestedClipIds.length !== state.clipOrder.length
    || requestedClipIds.some(
      (clipId) => state.clipsById[clipId] === undefined,
    )
  ) {
    reject(
      "INVALID_COMMAND",
      "Adding an instrument requires exactly one initial state per clip.",
      command.type,
    );
  }

  const track: Track = {
    instrumentId: command.instrument.id,
    notesById: {},
  };
  const clipsById: Record<ClipId, Clip> = {};

  for (const clipId of state.clipOrder) {
    const clip = state.clipsById[clipId];

    if (clip === undefined) {
      continue;
    }

    if (hasOwn(clip.tracksByInstrumentId, command.instrument.id)) {
      reject(
        "TRACK_ALREADY_EXISTS",
        `Track "${command.instrument.id}" already exists in clip "${clip.id}".`,
        command.type,
      );
    }

    const clipInstrumentState = command.clipInstrumentStatesById[clipId];

    if (clipInstrumentState === undefined) {
      reject(
        "INVALID_COMMAND",
        `Initial instrument state is missing for clip "${clipId}".`,
        command.type,
      );
    }

    assertValidClipInstrumentState(
      clipInstrumentState,
      command.type,
      `Clip "${clipId}" instrument "${command.instrument.id}"`,
    );

    clipsById[clipId] = {
      ...clip,
      tracksByInstrumentId: {
        ...clip.tracksByInstrumentId,
        [command.instrument.id]: track,
      },
      instrumentStatesById: {
        ...clip.instrumentStatesById,
        [command.instrument.id]: clipInstrumentState,
      },
    };
  }

  return {
    ...state,
    projectInstrumentsById: {
      ...state.projectInstrumentsById,
      [command.instrument.id]: command.instrument,
    },
    instrumentOrder: [...state.instrumentOrder, command.instrument.id],
    clipsById,
  };
}

export function applyUpdateProjectInstrument(
  state: ProjectState,
  command: UpdateProjectInstrumentCommand,
): ProjectState {
  const instrument = requireProjectInstrument(state, command.instrumentId, command.type);
  const updatedInstrument: ProjectInstrument = {
    ...instrument,
    name: command.changes.name ?? instrument.name,
    color: command.changes.color ?? instrument.color,
    instrument: command.changes.instrument ?? instrument.instrument,
    gain: command.changes.gain ?? instrument.gain,
    muted: command.changes.muted ?? instrument.muted,
    solo: command.changes.solo ?? instrument.solo,
    pan: command.changes.pan ?? instrument.pan,
    effects: command.changes.effects ?? instrument.effects,
    generativeRules:
      command.changes.generativeRules ?? instrument.generativeRules,
    interpretation:
      command.changes.interpretation ?? instrument.interpretation,
  };


  assertValidProjectInstrument(updatedInstrument);

  return {
    ...state,
    projectInstrumentsById: {
      ...state.projectInstrumentsById,
      [command.instrumentId]: updatedInstrument,
    },
  };
}

export function applyDeleteProjectInstrument(
  state: ProjectState,
  command: DeleteProjectInstrumentCommand,
): ProjectState {
  requireProjectInstrument(state, command.instrumentId, command.type);

  const projectInstrumentsById = omitRecordKey(state.projectInstrumentsById, command.instrumentId);
  const clipsById: Record<ClipId, Clip> = {};

  for (const clipId of state.clipOrder) {
    const clip = state.clipsById[clipId];

    if (clip !== undefined) {
      clipsById[clipId] = {
        ...clip,
        tracksByInstrumentId: omitRecordKey(
          clip.tracksByInstrumentId,
          command.instrumentId,
        ),
        instrumentStatesById: omitRecordKey(
          clip.instrumentStatesById,
          command.instrumentId,
        ),
      };
    }
  }

  return {
    ...state,
    projectInstrumentsById,
    instrumentOrder: state.instrumentOrder.filter(
      (instrumentId) => instrumentId !== command.instrumentId,
    ),
    clipsById,
  };
}

export function applyReorderProjectInstruments(
  state: ProjectState,
  command: ReorderProjectInstrumentsCommand,
): ProjectState {
  const currentIds = new Set(state.instrumentOrder);
  const requestedIds = new Set(command.instrumentOrder);

  if (
    requestedIds.size !== command.instrumentOrder.length
    || requestedIds.size !== currentIds.size
    || [...currentIds].some((instrumentId) => !requestedIds.has(instrumentId))
  ) {
    reject(
      "INVALID_INSTRUMENT_ORDER",
      "ProjectInstrument order must contain every instrument exactly once.",
      command.type,
    );
  }

  if (
    command.instrumentOrder.every(
      (instrumentId, index) => instrumentId === state.instrumentOrder[index],
    )
  ) {
    return state;
  }

  return {
    ...state,
    instrumentOrder: [...command.instrumentOrder],
  };
}

export function applyUpdateClipInstrumentState(
  state: ActiveClipProjectState,
  command: UpdateClipInstrumentStateCommand,
): ActiveClipProjectState {
  requireProjectInstrument(state, command.instrumentId, command.type);
  const current = state.instrumentStatesById[command.instrumentId];

  if (current === undefined) {
    reject(
      "INSTRUMENT_NOT_FOUND",
      `ProjectInstrument state "${command.instrumentId}" does not exist in the active clip.`,
      command.type,
    );
  }

  const updated: ClipInstrumentState = {
    locked: command.changes.locked ?? current.locked,
  };

  assertValidClipInstrumentState(
    updated,
    command.type,
    `Active clip instrument "${command.instrumentId}"`,
  );

  if (updated.locked === current.locked) {
    return state;
  }

  return {
    ...state,
    instrumentStatesById: {
      ...state.instrumentStatesById,
      [command.instrumentId]: updated,
    },
  };
}

export function assertValidClipInstrumentState(
  state: ClipInstrumentState,
  commandType: PianoRollCommand["type"],
  context: string,
): void {
  if (typeof state.locked !== "boolean") {
    reject(
      "INVALID_COMMAND",
      `${context} has an invalid lock state.`,
      commandType,
    );
  }

}
