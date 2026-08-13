import {
  APPLICATION_CONSTANTS,
  DEMO_INSTRUMENTS,
} from "../../config/product-config";
import {
  PROJECT_CONSTANTS,
} from "../../config/domain-limits";
import type {
  Clip,
  ClipInstrumentState,
  InstrumentId,
  Note,
  NoteId,
  ProjectInstrument,
  ProjectState,
  Track,
} from "../../domain/model";
import {
  createDefaultMasterBusState,
  createDefaultClipTimeline,
  createDefaultProjectClock,
  createDefaultTransportState,
  DEFAULT_MEASURE_COUNT,
  PROJECT_SCHEMA_VERSION,
} from "../../domain/model";
import {
  createDefaultInstrumentConfig,
  createDefaultInstrumentPresetLibrary,
} from "../../domain/instrument-presets";
import {
  createDefaultClipInstrumentState,
  createDefaultProjectInstrument,
} from "../../domain/project-instrument-factory";

export interface InitialProjectInstrument {
  readonly id: InstrumentId;
  readonly name: string;
  readonly color: string;
}

export interface InitialProjectOptions {
  readonly title: string;
  readonly notes: readonly Note[];
  readonly instruments: readonly InitialProjectInstrument[];
  readonly tempoBpm: number;
}

/** Builds the first clip of a project independently from React composition. */
export function createInitialProjectState(
  options: InitialProjectOptions,
): ProjectState {
  const projectInstrumentsById: Record<InstrumentId, ProjectInstrument> = {};
  const tracksByInstrumentId: Record<InstrumentId, Track> = {};
  const instrumentStatesById: Record<InstrumentId, ClipInstrumentState> = {};
  const notesByInstrumentId: Record<InstrumentId, Record<NoteId, Note>> = {};
  const instrumentOrder: InstrumentId[] = [];

  for (let index = 0; index < options.instruments.length; index += 1) {
    const seed = options.instruments[index];

    if (seed === undefined) {
      continue;
    }

    const instrument = createDefaultProjectInstrument({
      ...seed,
      instrument: createDefaultInstrumentConfig(index),
    });
    projectInstrumentsById[instrument.id] = instrument;
    instrumentStatesById[instrument.id] = createDefaultClipInstrumentState();
    notesByInstrumentId[instrument.id] = {};
    instrumentOrder.push(instrument.id);
  }

  for (const note of options.notes) {
    const notesById = notesByInstrumentId[note.instrumentId];

    if (notesById !== undefined) {
      notesById[note.id] = note;
    }
  }

  for (const instrumentId of instrumentOrder) {
    tracksByInstrumentId[instrumentId] = {
      instrumentId,
      notesById: notesByInstrumentId[instrumentId] ?? {},
    };
  }

  const clipId = "clip-main";
  const clock = {
    ...createDefaultProjectClock(),
    tempoBpm: options.tempoBpm,
  };
  const clip: Clip = {
    id: clipId,
    name: "Main Clip",
    timeline: createDefaultClipTimeline(clock, DEFAULT_MEASURE_COUNT),
    tracksByInstrumentId,
    instrumentStatesById,
    transportSettings: createDefaultTransportState(),
  };
  const presetLibrary = createDefaultInstrumentPresetLibrary();

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    revision: 0,
    title: options.title,
    clock,
    projectInstrumentsById,
    instrumentOrder,
    instrumentPresetsById: presetLibrary.instrumentPresetsById,
    instrumentPresetOrder: presetLibrary.instrumentPresetOrder,
    clipsById: { [clipId]: clip },
    clipOrder: [clipId],
    workspace: { activeClipId: clipId },
    masterBus: createDefaultMasterBusState(),
  };
}

export function createBlankProjectState(): ProjectState {
  return createInitialProjectState({
    title: APPLICATION_CONSTANTS.defaultProjectTitle,
    notes: [],
    instruments: DEMO_INSTRUMENTS,
    tempoBpm: PROJECT_CONSTANTS.demoTempoBpm,
  });
}
