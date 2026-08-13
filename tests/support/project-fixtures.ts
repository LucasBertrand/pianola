import {
  createDefaultInstrumentConfig,
  createDefaultInstrumentPresetLibrary,
} from "../../src/domain/instrument-presets";
import {
  createDefaultMasterBusState,
} from "../../src/domain/master-bus";
import {
  createDefaultProjectClock,
  createDefaultTransportState,
  getTicksPerMeasure,
  type TransportState,
  type TimeSignature,
} from "../../src/domain/transport/transport";
import {
  getActiveClip,
  PROJECT_SCHEMA_VERSION,
  type ProjectState,
} from "../../src/domain/project/project-document";
import {
  type ClipInstrumentState,
  type Track,
} from "../../src/domain/clips/clip";
import {
  type InstrumentId,
} from "../../src/domain/identifiers";
import {
  type Note,
} from "../../src/domain/notes/note";
import {
  type ProjectInstrument,
} from "../../src/domain/instruments/instrument";
import type {
  NativeEditorState,
} from "../../src/project-io/native/native-project-schema";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
} from "../../src/music/pitch-snap";
import {
  createTestNote,
  createTestProject,
  TEST_CLIP_ID,
  TEST_INSTRUMENT_ID,
} from "./test-builders";

export const SECOND_TEST_CLIP_ID = "clip-b";

interface AudioTestProjectOptions {
  readonly measureCount?: number;
  readonly notesByInstrumentId?: Readonly<Record<InstrumentId, readonly Note[]>>;
  readonly revision?: number;
  readonly masterGain?: number;
  readonly masterMuted?: boolean;
  readonly masterTuningFrequencyHz?: number;
  readonly transport?: Partial<TransportState> & {
    readonly loop?: Partial<TransportState["loop"]>;
    readonly bpm?: number;
    readonly ppqn?: number;
    readonly timeSignature?: Partial<TimeSignature>;
  };
  readonly instrumentOrder?: readonly InstrumentId[];
  readonly projectInstrumentChangesById?: Readonly<
    Record<InstrumentId, Partial<ProjectInstrument>>
  >;
  readonly instrumentStateChangesById?: Readonly<
    Record<InstrumentId, Partial<ClipInstrumentState>>
  >;
}

export function createAudioTestNote(
  id: string,
  instrumentId: InstrumentId,
  pitch: number,
  startTick: number,
  durationTicks = 120,
  velocity = 100,
): Note {
  return createTestNote({
    id,
    instrumentId,
    pitch,
    startTick,
    durationTicks,
    velocity,
  });
}

export function createAudioTestProjectInstrument(
  instrumentId: InstrumentId,
  instrumentIndex = 0,
): ProjectInstrument {
  return {
    id: instrumentId,
    name: `Instrument ${instrumentIndex + 1}`,
    color: instrumentIndex % 2 === 0 ? "#79a7ff" : "#a77bf3",
    instrument: createDefaultInstrumentConfig(instrumentIndex),
    gain: 0.8,
    muted: false,
    solo: false,
    pan: 0,
    effects: [],
    generativeRules: [],
    interpretation: {
      transposeSemitones: 0,
      timingOffsetTicks: 0,
      gateRatio: 1,
      velocityScale: 1,
      probability: 1,
    },
  };
}

export function createAudioTestProject({
  measureCount = 4,
  notesByInstrumentId = {},
  revision = 0,
  masterGain = createDefaultMasterBusState().gain,
  masterMuted = createDefaultMasterBusState().muted,
  masterTuningFrequencyHz =
    createDefaultMasterBusState().tuningFrequencyHz,
  transport: transportChanges = {},
  instrumentOrder = ["voice-a"],
  projectInstrumentChangesById = {},
  instrumentStateChangesById = {},
}: AudioTestProjectOptions = {}): ProjectState {
  const defaultTransport = createDefaultTransportState();
  const defaultClock = createDefaultProjectClock();
  const timeSignature: TimeSignature = {
    numerator: 4,
    denominator: 4,
    ...transportChanges.timeSignature,
  };
  const clock = {
    ...defaultClock,
    tempoBpm: transportChanges.bpm ?? defaultClock.tempoBpm,
    ppqn: transportChanges.ppqn ?? defaultClock.ppqn,
  };
  const transportSettings: TransportState = {
    ...defaultTransport,
    anchorTick: transportChanges.anchorTick ?? defaultTransport.anchorTick,
    loopEnabled:
      transportChanges.loopEnabled ?? defaultTransport.loopEnabled,
    loop: {
      ...defaultTransport.loop,
      ...transportChanges.loop,
    },
  };
  const projectInstrumentsById: Record<InstrumentId, ProjectInstrument> = {};
  const tracksByInstrumentId: Record<InstrumentId, Track> = {};
  const instrumentStatesById: Record<InstrumentId, ClipInstrumentState> = {};

  for (
    let instrumentIndex = 0;
    instrumentIndex < instrumentOrder.length;
    instrumentIndex += 1
  ) {
    const instrumentId = instrumentOrder[instrumentIndex];

    if (instrumentId === undefined) {
      continue;
    }

    const notes = notesByInstrumentId[instrumentId] ?? [];

    projectInstrumentsById[instrumentId] = {
      ...createAudioTestProjectInstrument(instrumentId, instrumentIndex),
      ...projectInstrumentChangesById[instrumentId],
    };
    tracksByInstrumentId[instrumentId] = {
      instrumentId,
      notesById: Object.fromEntries(notes.map((note) => [note.id, note])),
    };
    instrumentStatesById[instrumentId] = {
      locked: false,
      ...instrumentStateChangesById[instrumentId],
    };
  }

  const clipId = "clip-test";
  const presetLibrary = createDefaultInstrumentPresetLibrary();

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    revision,
    title: "Audio test project",
    clock,
    projectInstrumentsById,
    instrumentOrder: [...instrumentOrder],
    instrumentPresetsById: presetLibrary.instrumentPresetsById,
    instrumentPresetOrder: presetLibrary.instrumentPresetOrder,
    clipsById: {
      [clipId]: {
        id: clipId,
        name: "Test Clip",
        timeline: {
          durationTicks:
            measureCount * getTicksPerMeasure(clock, timeSignature),
          meterMap: {
            segments: [{ startTick: 0, timeSignature }],
          },
        },
        tracksByInstrumentId,
        instrumentStatesById,
        transportSettings,
      },
    },
    clipOrder: [clipId],
    workspace: { activeClipId: clipId },
    masterBus: {
      gain: masterGain,
      muted: masterMuted,
      tuningFrequencyHz: masterTuningFrequencyHz,
    },
  };
}

export function createAudioTestEditorState(
  overrides: Partial<NativeEditorState> = {},
): NativeEditorState {
  return {
    activeClipId: "clip-test",
    selectedInstrumentId: "voice-a",
    selectionMode: "add",
    noteColorMode: "pitch",
    pitchPreviewEnabled: false,
    clipStatesById: {
      "clip-test": {
        playheadTick: 960,
        pitchSnapSettings: {
          ...DEFAULT_PITCH_SNAP_SETTINGS,
          enabled: true,
          visualGuideEnabled: true,
          tonicPitchClass: 2,
        },
        gridSettings: {
          baseResolutionTicks: 480,
          subdivision: "triplet",
          resolutionTicks: 320,
        },
        viewport: {
          zoomX: 1.4,
          zoomY: 1.2,
          scrollX: 240,
          scrollY: 360,
        },
      },
    },
    ...overrides,
  };
}

export function getAudioTestActiveClip(state: ProjectState) {
  return getActiveClip(state);
}

export function createCriticalBehaviorProject() {
  return createTestProject({
    clips: [
      {
        id: TEST_CLIP_ID,
        name: "Editing witness",
        measureCount: 1,
        notes: [
          createTestNote({
            id: "existing-note",
            pitch: 60,
            startTick: 0,
            durationTicks: 120,
          }),
          createTestNote({
            id: "scheduled-note",
            pitch: 67,
            startTick: 480,
            durationTicks: 240,
          }),
        ],
      },
      {
        id: SECOND_TEST_CLIP_ID,
        name: "Navigation witness",
        measureCount: 2,
      },
    ],
  });
}

export const CRITICAL_BEHAVIOR_EXPECTATION = Object.freeze({
  drawnNote: {
    id: "drawn-note",
    instrumentId: TEST_INSTRUMENT_ID,
    pitch: 64,
    startTick: 360,
    durationTicks: 120,
    velocity: 96,
    enabled: true,
  },
  mergedCollision: {
    id: "collision-proposal",
    instrumentId: TEST_INSTRUMENT_ID,
    pitch: 60,
    startTick: 0,
    durationTicks: 180,
    velocity: 100,
    enabled: true,
  },
});
