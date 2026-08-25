import {
  type Clip,
  type Track,
} from "../clips/clip";
import {
  getClipPlaybackOrder,
} from "../clips/clip-hierarchy";
import {
  type ClipId,
  type PresetId,
} from "../identifiers";
import {
  type InstrumentPreset,
  type ProjectInstrument,
} from "../instruments/instrument";
import {
  type ProjectState,
} from "../project/project-document";
import {
  MAXIMUM_PROJECT_INSTRUMENT_COUNT,
} from "../instruments/instrument";
import {
  assertValidProjectInstrument,
  validateInstrumentPreset,
} from "../validation/instrument-validation";
import type {
  AddProjectInstrumentCommand,
  DeleteProjectInstrumentCommand,
  DeleteInstrumentPresetCommand,
  PianoRollCommand,
  ReorderProjectInstrumentsCommand,
  SaveInstrumentPresetCommand,
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

  const track: Track = {
    instrumentId: command.instrument.id,
    notesById: {},
  };
  const clipsById: Record<ClipId, Clip> = {};

  for (const clipId of getClipPlaybackOrder(state.clipHierarchy)) {
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

    clipsById[clipId] = {
      ...clip,
      tracksByInstrumentId: {
        ...clip.tracksByInstrumentId,
        [command.instrument.id]: track,
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

  for (const clipId of getClipPlaybackOrder(state.clipHierarchy)) {
    const clip = state.clipsById[clipId];

    if (clip !== undefined) {
      clipsById[clipId] = {
        ...clip,
        tracksByInstrumentId: omitRecordKey(
          clip.tracksByInstrumentId,
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

export function applySaveInstrumentPreset(
  state: ProjectState,
  command: SaveInstrumentPresetCommand,
): ProjectState {
  const validation = validateInstrumentPreset(command.preset);

  if (!validation.valid) {
    reject(
      "INVALID_COMMAND",
      validation.issues[0]?.message ?? "Instrument preset is invalid.",
      command.type,
    );
  }

  const existing = state.instrumentPresetsById[command.preset.id];

  if (
    existing === undefined
    && state.instrumentPresetOrder.length >= MAXIMUM_PROJECT_INSTRUMENT_COUNT
  ) {
    reject(
      "INVALID_COMMAND",
      `A project cannot contain more than ${MAXIMUM_PROJECT_INSTRUMENT_COUNT} instrument presets.`,
      command.type,
    );
  }

  const preset: InstrumentPreset = {
    ...command.preset,
    config: {
      ...command.preset.config,
      envelope: { ...command.preset.config.envelope },
      filterEnvelope: { ...command.preset.config.filterEnvelope },
    },
  };

  return {
    ...state,
    instrumentPresetsById: {
      ...state.instrumentPresetsById,
      [preset.id]: preset,
    },
    instrumentPresetOrder: existing === undefined
      ? [...state.instrumentPresetOrder, preset.id]
      : state.instrumentPresetOrder,
  };
}

export function applyDeleteInstrumentPreset(
  state: ProjectState,
  command: DeleteInstrumentPresetCommand,
): ProjectState {
  requireInstrumentPreset(state, command.presetId, command.type);

  if (state.instrumentPresetOrder.length <= 1) {
    reject(
      "INVALID_COMMAND",
      "A project must retain at least one instrument preset.",
      command.type,
    );
  }

  return {
    ...state,
    instrumentPresetsById: omitRecordKey(
      state.instrumentPresetsById,
      command.presetId,
    ),
    instrumentPresetOrder: state.instrumentPresetOrder.filter(
      (presetId) => presetId !== command.presetId,
    ),
  };
}

function requireInstrumentPreset(
  state: ProjectState,
  presetId: PresetId,
  commandType: PianoRollCommand["type"],
): InstrumentPreset {
  const preset = state.instrumentPresetsById[presetId];

  if (preset === undefined) {
    reject(
      "INVALID_COMMAND",
      `Instrument preset "${presetId}" does not exist.`,
      commandType,
    );
  }

  return preset;
}
