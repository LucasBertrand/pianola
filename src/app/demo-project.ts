import type {
  Note,
  ProjectState,
  InstrumentId,
} from "../domain/model";
import {
  APPLICATION_CONSTANTS,
  DEMO_INSTRUMENTS as PRODUCT_DEMO_INSTRUMENTS,
} from "../config/product-config";
import {
  EDITOR_CONSTANTS,
} from "../config/editor-config";
import {
  PROJECT_CONSTANTS,
} from "../config/domain-limits";
import {
  createInitialProjectState,
} from "../use-cases/project-files/create-initial-project";

export const DEMO_NOTE_COUNT = EDITOR_CONSTANTS.demoNoteCount;
const DEMO_INITIAL_NOTE_SPAN_TICKS =
  EDITOR_CONSTANTS.demoInitialNoteSpanTicks;

export interface DemoInstrument {
  readonly id: InstrumentId;
  readonly name: string;
  readonly color: string;
}

export const DEMO_INSTRUMENTS: readonly DemoInstrument[] =
  PRODUCT_DEMO_INSTRUMENTS;

export function createDemoProjectState(): ProjectState {
  return createInitialProjectState({
    title: APPLICATION_CONSTANTS.demoProjectTitle,
    notes: createDemoNotes(DEMO_NOTE_COUNT),
    instruments: DEMO_INSTRUMENTS,
    tempoBpm: PROJECT_CONSTANTS.demoTempoBpm,
  });
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
