import {
  type Clip,
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
import {
  type EditorSessionState,
} from "../../src/domain/project/project-document";
import {
  getActiveClip,
} from "../../src/domain/project/project-document";
import type {
  MidiImportAnalysis,
} from "../../src/project-io/midi/midi-import-types";

export function createRawFormatZeroMidiFile(
  trackBytes: Uint8Array,
  division = 480,
): Uint8Array {
  const bytes = new Uint8Array(22 + trackBytes.length);

  bytes.set([
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    (division >>> 8) & 0xff,
    division & 0xff,
    0x4d, 0x54, 0x72, 0x6b,
    (trackBytes.length >>> 24) & 0xff,
    (trackBytes.length >>> 16) & 0xff,
    (trackBytes.length >>> 8) & 0xff,
    trackBytes.length & 0xff,
  ]);
  bytes.set(trackBytes, 22);
  return bytes;
}

export function createMidiImportAnalysisFixture(
  projectInstrument: ProjectInstrument,
  notes: readonly Note[],
  collisionCount: number,
): MidiImportAnalysis {
  return {
    title: "Collision import",
    sourceFormat: 1,
    sourceTicksPerQuarterNote: 960,
    tempoMarkers: [{ startTick: 0, bpm: 120 }],
    meterMarkers: [{
      startTick: 0,
      timeSignature: {
        numerator: 4,
        denominator: 4,
      },
    }],
    timelineEndTick: notes.reduce(
      (maximum, note) => Math.max(
        maximum,
        note.startTick + note.durationTicks,
      ),
      0,
    ),
    instrumentCandidates: [{
      projectInstrument,
      notes,
    }],
    noteCount: notes.length,
    collisionCount,
    ignoredControlChangeCount: 0,
    ignoredSustainControlChangeCount: 0,
    warnings: [],
  };
}

export function getProjectNotes(
  state: EditorSessionState,
  instrumentId: InstrumentId,
): Note[] {
  const track = getActiveClip(state).tracksByInstrumentId[instrumentId];

  if (track === undefined) {
    return [];
  }

  return Object.values(track.notesById).sort((left, right) =>
    left.startTick - right.startTick
    || left.pitch - right.pitch
    || left.id.localeCompare(right.id));
}

export function getActiveTestClip(state: EditorSessionState): Clip {
  return getActiveClip(state);
}

export function normalizeProjectInstruments(state: EditorSessionState) {
  return state.instrumentOrder.map((instrumentId) => {
    const projectInstrument = state.projectInstrumentsById[instrumentId];

    if (projectInstrument === undefined) {
      throw new Error(`Missing project instrument "${instrumentId}".`);
    }

    return {
      name: projectInstrument.name,
      notes: getProjectNotes(state, instrumentId).map((note) => [
        note.pitch,
        note.startTick,
        note.durationTicks,
        note.velocity,
      ]),
    };
  });
}
