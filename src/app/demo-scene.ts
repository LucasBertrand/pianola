import type {
  Note,
  NoteId,
  Clip,
  ClipVoiceState,
  ProjectState,
  Track,
  Voice,
  VoiceId,
} from "../domain/model";
import {
  APPLICATION_CONSTANTS,
  EDITOR_CONSTANTS,
  PROJECT_CONSTANTS,
  VOICE_CONSTANTS,
} from "../config/program-constants";
import {
  createDefaultMasterBusState,
  createDefaultTransportState,
  DEFAULT_MEASURE_COUNT,
  PROJECT_SCHEMA_VERSION,
} from "../domain/model";
import {
  createDefaultClipVoiceState,
  createDefaultVoice,
  getDefaultOscillatorWaveform,
} from "../domain/voice-factory";

export const DEMO_NOTE_COUNT = EDITOR_CONSTANTS.demoNoteCount;
const DEMO_INITIAL_NOTE_SPAN_TICKS =
  EDITOR_CONSTANTS.demoInitialNoteSpanTicks;

export interface DemoVoice {
  readonly id: VoiceId;
  readonly name: string;
  readonly color: string;
}

export const DEMO_VOICES: readonly DemoVoice[] =
  VOICE_CONSTANTS.demoVoices;

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
  const voicesById: Record<VoiceId, Voice> = {};
  const tracksByVoiceId: Record<VoiceId, Track> = {};
  const voiceStatesById: Record<VoiceId, ClipVoiceState> = {};
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

    const voice = createDomainVoice(demoVoice);
    voicesById[voice.id] = voice;
    voiceStatesById[voice.id] = createDefaultClipVoiceState(
      getDefaultOscillatorWaveform(voiceIndex),
    );
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

  const clipId = "clip-main";
  const clip: Clip = {
    id: clipId,
    name: "Main Clip",
    measureCount: DEFAULT_MEASURE_COUNT,
    tracksByVoiceId,
    voiceStatesById,
    transportSettings: {
      ...createDefaultTransportState(),
      bpm: PROJECT_CONSTANTS.demoTempoBpm,
    },
  };

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    revision: 0,
    title,
    voicesById,
    voiceOrder,
    clipsById: {
      [clipId]: clip,
    },
    clipOrder: [clipId],
    activeClipId: clipId,
    masterBus: createDefaultMasterBusState(),
  };
}

function createDomainVoice(
  demoVoice: DemoVoice,
): Voice {
  return createDefaultVoice({
    id: demoVoice.id,
    name: demoVoice.name,
    color: demoVoice.color,
  });
}
