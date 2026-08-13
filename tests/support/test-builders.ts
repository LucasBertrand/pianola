import {
  createDefaultInstrumentConfig,
  createDefaultInstrumentPresetLibrary,
} from "../../src/domain/instrument-presets";
import {
  createDefaultMasterBusState,
  createDefaultClipTimeline,
  createDefaultProjectClock,
  createDefaultTransportState,
  PROJECT_SCHEMA_VERSION,
  type Clip,
  type ClipId,
  type InstrumentId,
  type Note,
  type ProjectState,
} from "../../src/domain/model";
import {
  createDefaultClipInstrumentState,
  createDefaultProjectInstrument,
} from "../../src/domain/project-instrument-factory";

export const TEST_INSTRUMENT_ID = "instrument-a";
export const TEST_CLIP_ID = "clip-a";

export interface TestNoteOptions {
  readonly id: string;
  readonly instrumentId?: InstrumentId;
  readonly pitch?: number;
  readonly startTick?: number;
  readonly durationTicks?: number;
  readonly velocity?: number;
  readonly enabled?: boolean;
}

export interface TestClipOptions {
  readonly id: ClipId;
  readonly name?: string;
  readonly measureCount?: number;
  readonly notes?: readonly Note[];
  readonly anchorTick?: number;
}

export interface TestProjectOptions {
  readonly title?: string;
  readonly revision?: number;
  readonly instrumentIds?: readonly InstrumentId[];
  readonly clips?: readonly TestClipOptions[];
  readonly activeClipId?: ClipId;
}

export function createTestNote({
  id,
  instrumentId = TEST_INSTRUMENT_ID,
  pitch = 60,
  startTick = 0,
  durationTicks = 120,
  velocity = 100,
  enabled = true,
}: TestNoteOptions): Note {
  return {
    id,
    instrumentId,
    pitch,
    startTick,
    durationTicks,
    velocity,
    enabled,
  };
}

export function createTestProject({
  title = "P0 behavior witness",
  revision = 0,
  instrumentIds = [TEST_INSTRUMENT_ID],
  clips = [{ id: TEST_CLIP_ID }],
  activeClipId = clips[0]?.id ?? TEST_CLIP_ID,
}: TestProjectOptions = {}): ProjectState {
  const projectInstrumentsById = Object.fromEntries(
    instrumentIds.map((instrumentId, instrumentIndex) => [
      instrumentId,
      createDefaultProjectInstrument({
        id: instrumentId,
        name: `Instrument ${instrumentIndex + 1}`,
        color: instrumentIndex % 2 === 0 ? "#79a7ff" : "#a77bf3",
        instrument: createDefaultInstrumentConfig(instrumentIndex),
      }),
    ]),
  );
  const clipsById = Object.fromEntries(
    clips.map((clip) => [
      clip.id,
      createTestClip(clip, instrumentIds),
    ]),
  );
  const presetLibrary = createDefaultInstrumentPresetLibrary();

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    revision,
    title,
    clock: createDefaultProjectClock(),
    projectInstrumentsById,
    instrumentOrder: [...instrumentIds],
    instrumentPresetsById: presetLibrary.instrumentPresetsById,
    instrumentPresetOrder: presetLibrary.instrumentPresetOrder,
    clipsById,
    clipOrder: clips.map((clip) => clip.id),
    workspace: { activeClipId },
    masterBus: createDefaultMasterBusState(),
  };
}

function createTestClip(
  {
    id,
    name = id,
    measureCount = 4,
    notes = [],
    anchorTick = 0,
  }: TestClipOptions,
  instrumentIds: readonly InstrumentId[],
): Clip {
  const tracksByInstrumentId = Object.fromEntries(
    instrumentIds.map((instrumentId) => [
      instrumentId,
      {
        instrumentId,
        notesById: Object.fromEntries(
          notes
            .filter((note) => note.instrumentId === instrumentId)
            .map((note) => [note.id, note]),
        ),
      },
    ]),
  );
  const instrumentStatesById = Object.fromEntries(
    instrumentIds.map((instrumentId) => [
      instrumentId,
      createDefaultClipInstrumentState(),
    ]),
  );

  return {
    id,
    name,
    timeline: createDefaultClipTimeline(
      createDefaultProjectClock(),
      measureCount,
    ),
    tracksByInstrumentId,
    instrumentStatesById,
    transportSettings: {
      ...createDefaultTransportState(),
      anchorTick,
    },
  };
}
