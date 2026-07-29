import type {
  Note,
  NoteId,
  OscillatorWaveform,
  ProjectState,
  Track,
  Voice,
  VoiceId,
} from "../domain/model";
import {
  createDefaultMasterBusState,
  createDefaultTransportState,
  DEFAULT_MEASURE_COUNT,
  getProjectDurationTicks,
  PROJECT_SCHEMA_VERSION,
} from "../domain/model";
import {
  ProjectStore,
} from "../domain/project-store";
import type {
  ViewportState,
} from "../geometry/converter";
import {
  SpatialIndex,
} from "../geometry/spatial-index";
import type {
  Rect,
} from "../ui/components/PianoRollLayers";
import type {
  NoteColorMode,
  VoiceRenderStyle,
} from "../ui/rendering/note-style";
import type {
  InteractionModeState,
} from "../ui/interactions/types";
import {
  DEFAULT_GRID_SETTINGS,
  type GridSettings,
} from "../ui/rendering/grid-settings";
import {
  MappedRenderSignal,
  MutableRenderSignal,
  type ReadonlyRenderSignal,
} from "../ui/rendering/render-signal";

export const DEMO_NOTE_COUNT = 100;
const DEMO_INITIAL_NOTE_SPAN_TICKS = 960 * 4 * 8;
export const INITIAL_PITCH_HEIGHT = 18;
export const INITIAL_MAX_VISIBLE_PITCH = 84;

export interface DemoVoice {
  readonly id: VoiceId;
  readonly name: string;
  readonly role: string;
  readonly color: string;
  readonly waveform: string;
}

export interface DemoScene {
  readonly projectStore: ProjectStore;
  readonly spatialIndex: SpatialIndex;
  readonly viewport: MutableRenderSignal<ViewportState>;
  readonly visibleRegion: MutableRenderSignal<Rect>;
  readonly voiceStyles: MutableRenderSignal<
    Readonly<Record<VoiceId, VoiceRenderStyle>>
  >;
  readonly noteColorMode: MutableRenderSignal<NoteColorMode>;
  readonly voiceSelectionRequest: MutableRenderSignal<VoiceId | null>;
  readonly playheadTick: MutableRenderSignal<number>;
  readonly interactionToolState: MutableRenderSignal<InteractionModeState>;
  readonly gridSettings: MutableRenderSignal<GridSettings>;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
}

export const DEMO_VOICES: readonly DemoVoice[] = [
  {
    id: "voice-atlas",
    name: "Atlas",
    role: "Foundation",
    color: "#79a7ff",
    waveform: "Saw",
  },
  {
    id: "voice-bloom",
    name: "Bloom",
    role: "Harmony",
    color: "#a77bf3",
    waveform: "Sine",
  },
] as const;

export function createDemoScene(): DemoScene {
  const viewportState: ViewportState = {
    zoomX: 1,
    zoomY: 1,
    scrollX: 0,
    scrollY:
      (127 - INITIAL_MAX_VISIBLE_PITCH) * INITIAL_PITCH_HEIGHT,
    pitchHeight: INITIAL_PITCH_HEIGHT,
    ticksPerPixel: 5,
    devicePixelRatio: 1,
  };
  const spatialIndex = new SpatialIndex();
  const notes = createDemoNotes(DEMO_NOTE_COUNT);
  const projectStore = new ProjectStore(
    createProjectState(notes, "Untitled exploration"),
  );
  const indexedNotesBuffer: Note[] = [];
  const voiceStyles = new MutableRenderSignal(
    createVoiceRenderStyles(projectStore.getState()),
  );
  const gridSettings = new MutableRenderSignal<GridSettings>(
    DEFAULT_GRID_SETTINGS,
  );

  spatialIndex.update(notes);
  projectStore.subscribe((state, previousState) => {
    if (
      state.tracksByVoiceId
      !== previousState.tracksByVoiceId
    ) {
      rebuildSpatialIndex(
        state,
        spatialIndex,
        indexedNotesBuffer,
      );
    }

    if (state.voicesById !== previousState.voicesById) {
      voiceStyles.set(createVoiceRenderStyles(state));
    }
  });

  return {
    projectStore,
    spatialIndex,
    viewport: new MutableRenderSignal(viewportState),
    visibleRegion: new MutableRenderSignal(
      calculateVisibleRegion(
        viewportState,
        1_600,
        900,
        getProjectDurationTicks(projectStore.getState()),
      ),
    ),
    voiceStyles,
    noteColorMode: new MutableRenderSignal<NoteColorMode>(
      "voice",
    ),
    voiceSelectionRequest: new MutableRenderSignal<VoiceId | null>(
      null,
    ),
    playheadTick: new MutableRenderSignal(960 * 4),
    interactionToolState: new MutableRenderSignal({
      activeTool: "select",
    }),
    gridSettings,
    gridResolutionTicks: new MappedRenderSignal(
      gridSettings,
      getGridResolutionTicks,
    ),
  };
}

function getGridResolutionTicks(settings: GridSettings): number {
  return settings.resolutionTicks;
}

export function createBlankProjectState(): ProjectState {
  return createProjectState([], "Untitled project");
}

function createVoiceRenderStyles(
  state: ProjectState,
): Readonly<Record<VoiceId, VoiceRenderStyle>> {
  const styles: Record<VoiceId, VoiceRenderStyle> = {};

  for (
    let voiceIndex = 0;
    voiceIndex < state.voiceOrder.length;
    voiceIndex += 1
  ) {
    const voiceId = state.voiceOrder[voiceIndex];

    if (voiceId === undefined) {
      continue;
    }

    const voice = state.voicesById[voiceId];

    if (voice !== undefined) {
      styles[voiceId] = {
        fillStyle: voice.color,
        opacity: voice.muted ? 0.16 : 1,
        locked: voice.locked,
      };
    }
  }

  return styles;
}

export function calculateVisibleRegion(
  viewport: ViewportState,
  widthCssPixels: number,
  heightCssPixels: number,
  totalTicks: number,
): Rect {
  const startTick =
    viewport.scrollX * viewport.ticksPerPixel / viewport.zoomX;
  const endTick =
    (viewport.scrollX + widthCssPixels)
    * viewport.ticksPerPixel
    / viewport.zoomX;
  const pitchHeight =
    viewport.pitchHeight * viewport.zoomY;
  const maxPitch =
    127 - Math.floor(viewport.scrollY / pitchHeight);
  const minPitch =
    127
    - Math.floor(
      (viewport.scrollY + heightCssPixels) / pitchHeight,
    );

  return {
    startTick: Math.max(0, startTick),
    endTick: Math.min(totalTicks, endTick),
    minPitch: Math.max(0, minPitch),
    maxPitch: Math.min(127, maxPitch),
  };
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
    const voiceIndex =
      (randomState >>> 24) % DEMO_VOICES.length;
    const voice = DEMO_VOICES[voiceIndex];
    const durationTicks = getDurationTicks(durationSelector);

    if (voice === undefined) {
      throw new Error("A demo voice is required.");
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
          && candidate.voiceId === voice.id
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
      voiceId: voice.id,
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
  const voicesById: Record<VoiceId, Voice> = {};
  const tracksByVoiceId: Record<VoiceId, Track> = {};
  const mutableNotesByVoiceId: Record<
    VoiceId,
    Record<NoteId, Note>
  > = {};
  const voiceOrder: VoiceId[] = [];

  for (
    let voiceIndex = 0;
    voiceIndex < DEMO_VOICES.length;
    voiceIndex += 1
  ) {
    const demoVoice = DEMO_VOICES[voiceIndex];

    if (demoVoice === undefined) {
      continue;
    }

    const voice = createDomainVoice(demoVoice, voiceIndex);
    voicesById[voice.id] = voice;
    mutableNotesByVoiceId[voice.id] = {};
    voiceOrder.push(voice.id);
  }

  for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
    const note = notes[noteIndex];

    if (note !== undefined) {
      const notesById = mutableNotesByVoiceId[note.voiceId];

      if (notesById !== undefined) {
        notesById[note.id] = note;
      }
    }
  }

  for (
    let voiceIndex = 0;
    voiceIndex < voiceOrder.length;
    voiceIndex += 1
  ) {
    const voiceId = voiceOrder[voiceIndex];

    if (voiceId !== undefined) {
      tracksByVoiceId[voiceId] = {
        voiceId,
        notesById: mutableNotesByVoiceId[voiceId] ?? {},
      };
    }
  }

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    revision: 0,
    title,
    measureCount: DEFAULT_MEASURE_COUNT,
    voicesById,
    voiceOrder,
    tracksByVoiceId,
    transportSettings: {
      ...createDefaultTransportState(),
      bpm: 112,
    },
    masterBus: createDefaultMasterBusState(),
  };
}

function createDomainVoice(
  demoVoice: DemoVoice,
  voiceIndex: number,
): Voice {
  return {
    id: demoVoice.id,
    name: demoVoice.name,
    color: demoVoice.color,
    muted: false,
    locked: false,
    solo: false,
    gain: 0.82,
    pan: 0,
    instrument: {
      kind: "subtractive",
      oscillatorWaveform: getOscillatorWaveform(voiceIndex),
      oscillatorDetuneCents: 0,
      envelope: {
        attackSeconds: 0.012,
        decaySeconds: 0.18,
        sustainLevel: 0.72,
        releaseSeconds: 0.42,
      },
      filterCutoffHz: 12_000,
      filterResonance: 0.2,
    },
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

function getOscillatorWaveform(
  voiceIndex: number,
): OscillatorWaveform {
  switch (voiceIndex % 4) {
    case 0:
      return "sawtooth";
    case 1:
      return "sine";
    case 2:
      return "square";
    default:
      return "triangle";
  }
}

function rebuildSpatialIndex(
  state: ProjectState,
  spatialIndex: SpatialIndex,
  target: Note[],
): void {
  target.length = 0;

  for (
    let voiceIndex = 0;
    voiceIndex < state.voiceOrder.length;
    voiceIndex += 1
  ) {
    const voiceId = state.voiceOrder[voiceIndex];

    if (voiceId === undefined) {
      continue;
    }

    const track = state.tracksByVoiceId[voiceId];

    if (track === undefined) {
      continue;
    }

    for (const noteId in track.notesById) {
      const note = track.notesById[noteId];

      if (note !== undefined) {
        target.push(note);
      }
    }
  }

  spatialIndex.update(target);
}
