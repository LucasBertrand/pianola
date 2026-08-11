import type {
  Note,
  NoteId,
  Clip,
  ClipInstrumentState,
  ProjectState,
  Track,
  ProjectInstrument,
  InstrumentId,
  InstrumentConfig,
} from "../domain/model";
import {
  APPLICATION_CONSTANTS,
  EDITOR_CONSTANTS,
  PROJECT_CONSTANTS,
  INSTRUMENT_CONSTANTS,
} from "../config/program-constants";
import {
  createDefaultMasterBusState,
  createDefaultTransportState,
  DEFAULT_MEASURE_COUNT,
  PROJECT_SCHEMA_VERSION,
} from "../domain/model";
import {
  createDefaultClipInstrumentState,
  createDefaultProjectInstrument,
} from "../domain/project-instrument-factory";
import {
  createDefaultInstrumentPresetLibrary,
  createDefaultInstrumentConfig,
} from "../domain/instrument-presets";

export const DEMO_NOTE_COUNT = EDITOR_CONSTANTS.demoNoteCount;
const DEMO_INITIAL_NOTE_SPAN_TICKS =
  EDITOR_CONSTANTS.demoInitialNoteSpanTicks;

export interface DemoInstrument {
  readonly id: InstrumentId;
  readonly name: string;
  readonly color: string;
}

export const DEMO_INSTRUMENTS: readonly DemoInstrument[] =
  INSTRUMENT_CONSTANTS.demoInstruments;

export function createDemoProjectState(): ProjectState {
  return createProjectState(
    createDemoNotes(DEMO_NOTE_COUNT),
    PROJECT_CONSTANTS.demoProjectTitle,
  );
}

export function createBlankProjectState(): ProjectState {
  return createProjectState(
    [],
    APPLICATION_CONSTANTS.defaultProjectTitle,
  );
}

function createDemoNotes(noteCount: number): readonly Note[] {
  const notes = new Array<Note>(noteCount);
  let randomState = 0x5eeda11;

  for (let noteIndex = 0; noteIndex < noteCount; noteIndex += 1) {
    randomState = nextRandomState(randomState);
    const initialStartStep =
      (randomState >>> 1)
      % (DEMO_INITIAL_NOTE_SPAN_TICKS / 120);
    randomState = nextRandomState(randomState);
    const pitch = 32 + (randomState >>> 8) % 57;
    randomState = nextRandomState(randomState);
    const durationSelector = (randomState >>> 16) % 8;
    randomState = nextRandomState(randomState);
    const instrumentIndex =
      (randomState >>> 24) % DEMO_INSTRUMENTS.length;
    const instrument = DEMO_INSTRUMENTS[instrumentIndex];
    const durationTicks = getDurationTicks(durationSelector);

    if (instrument === undefined) {
      throw new Error("A demo instrument is required.");
    }

    const maximumStartStep =
      (DEMO_INITIAL_NOTE_SPAN_TICKS - durationTicks) / 120;
    let startTick = Math.min(
      initialStartStep,
      maximumStartStep,
    ) * 120;
    let placementFound = false;

    for (
      let placementAttempt = 0;
      placementAttempt <= maximumStartStep;
      placementAttempt += 1
    ) {
      placementFound = true;

      for (
        let candidateIndex = 0;
        candidateIndex < noteIndex;
        candidateIndex += 1
      ) {
        const candidate = notes[candidateIndex];

        if (
          candidate !== undefined
          && candidate.instrumentId === instrument.id
          && candidate.pitch === pitch
          && startTick
            < candidate.startTick + candidate.durationTicks
          && candidate.startTick < startTick + durationTicks
        ) {
          placementFound = false;
          break;
        }
      }

      if (placementFound) {
        break;
      }

      startTick =
        ((startTick / 120 + 1) % (maximumStartStep + 1)) * 120;
    }

    if (!placementFound) {
      throw new Error("A collision-free demo note could not be placed.");
    }

    notes[noteIndex] = {
      id: `demo-note-${noteIndex}`,
      pitch,
      startTick,
      durationTicks,
      velocity: 52 + (randomState >>> 12) % 76,
      instrumentId: instrument.id,
      enabled: true,
    };
  }

  return notes;
}

function nextRandomState(state: number): number {
  return (
    Math.imul(state, 1_664_525) + 1_013_904_223
  ) >>> 0;
}

function getDurationTicks(selector: number): number {
  switch (selector) {
    case 0:
    case 1:
      return 120;
    case 2:
    case 3:
      return 240;
    case 4:
    case 5:
      return 480;
    case 6:
      return 720;
    default:
      return 960;
  }
}

function createProjectState(
  notes: readonly Note[],
  title: string,
): ProjectState {
  const projectInstrumentsById: Record<InstrumentId, ProjectInstrument> = {};
  const tracksByInstrumentId: Record<InstrumentId, Track> = {};
  const instrumentStatesById: Record<InstrumentId, ClipInstrumentState> = {};
  const mutableNotesByInstrumentId: Record<
    InstrumentId,
    Record<NoteId, Note>
  > = {};
  const instrumentOrder: InstrumentId[] = [];

  for (
    let instrumentIndex = 0;
    instrumentIndex < DEMO_INSTRUMENTS.length;
    instrumentIndex += 1
  ) {
    const demoInstrument = DEMO_INSTRUMENTS[instrumentIndex];

    if (demoInstrument === undefined) {
      continue;
    }

    const instrument = createDomainInstrument(
      demoInstrument,
      createDefaultInstrumentConfig(instrumentIndex),
    );
    projectInstrumentsById[instrument.id] = instrument;
    instrumentStatesById[instrument.id] = createDefaultClipInstrumentState();
    mutableNotesByInstrumentId[instrument.id] = {};
    instrumentOrder.push(instrument.id);
  }

  for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
    const note = notes[noteIndex];

    if (note !== undefined) {
      const notesById = mutableNotesByInstrumentId[note.instrumentId];

      if (notesById !== undefined) {
        notesById[note.id] = note;
      }
    }
  }

  for (
    let instrumentIndex = 0;
    instrumentIndex < instrumentOrder.length;
    instrumentIndex += 1
  ) {
    const instrumentId = instrumentOrder[instrumentIndex];

    if (instrumentId !== undefined) {
      tracksByInstrumentId[instrumentId] = {
        instrumentId,
        notesById: mutableNotesByInstrumentId[instrumentId] ?? {},
      };
    }
  }

  const clipId = "clip-main";
  const clip: Clip = {
    id: clipId,
    name: "Main Clip",
    measureCount: DEFAULT_MEASURE_COUNT,
    tracksByInstrumentId,
    instrumentStatesById,
    transportSettings: {
      ...createDefaultTransportState(),
      bpm: PROJECT_CONSTANTS.demoTempoBpm,
    },
  };
  const presetLibrary = createDefaultInstrumentPresetLibrary();

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    revision: 0,
    title,
    projectInstrumentsById,
    instrumentOrder,
    instrumentPresetsById: presetLibrary.instrumentPresetsById,
    instrumentPresetOrder: presetLibrary.instrumentPresetOrder,
    clipsById: {
      [clipId]: clip,
    },
    clipOrder: [clipId],
    activeClipId: clipId,
    masterBus: createDefaultMasterBusState(),
  };
}

function createDomainInstrument(
  demoInstrument: DemoInstrument,
  instrument: InstrumentConfig,
): ProjectInstrument {
  return createDefaultProjectInstrument({
    id: demoInstrument.id,
    name: demoInstrument.name,
    color: demoInstrument.color,
    instrument,
  });
}
