import { describe, expect, test } from "vitest";
import { createTestNote } from "../../../../tests/support/test-builders";
import type { TimeMap } from "../../transport/time-map";
import { resolvePitchSnapSettings } from "../../../application/piano-roll/timeline/pitch-snap-resolution";
import { detectChordsFromNotes } from "../chord-recognition";
import type { PitchSnapSettings } from "../pitch-snap";
import { spellPitchClass } from "../pitch-spelling";

const F_MAJOR: PitchSnapSettings = { enabled: true, visualGuideEnabled: true, rootNote: "F", patternType: "scale", patternId: "ionian" };
const B_MAJOR: PitchSnapSettings = { ...F_MAJOR, rootNote: "B" };

describe("detectChordsFromNotes", () => {
  test("uses MusicTheoryJS interval names for two notes", () => {
    expect(detectChordsFromNotes([
      createTestNote({ id: "e", pitch: 64 }), createTestNote({ id: "bb", pitch: 70 }),
    ])).toBe("d5");
  });

  test("distinguishes diminished and augmented interval spelling", () => {
    const notes = [createTestNote({ id: "e", pitch: 64 }), createTestNote({ id: "enharmonic", pitch: 70 })];
    expect(detectChordsFromNotes(notes, (note) => spellPitchClass(note.pitch, F_MAJOR))).toBe("d5");
    expect(detectChordsFromNotes(notes, (note) => spellPitchClass(note.pitch, B_MAJOR))).toBe("A4");
  });

  test("uses the best unique MusicTheoryJS chord candidate", () => {
    const notes = [
      createTestNote({ id: "bb", pitch: 70 }), createTestNote({ id: "d", pitch: 74 }), createTestNote({ id: "f", pitch: 77 }),
    ];
    expect(detectChordsFromNotes(notes, (note) => spellPitchClass(note.pitch, F_MAJOR))).toBe("Bb");
  });

  test("spells every selected note with the context at its own tick", () => {
    const notes = [createTestNote({ id: "e", pitch: 64, startTick: 120 }), createTestNote({ id: "bb", pitch: 70, startTick: 600 })];
    const timeMap: TimeMap = {
      meterMarkers: [], tempoMarkers: [],
      scaleMarkers: [
        { startTick: 0, rootNote: "B", patternType: "scale", patternId: "ionian" },
        { startTick: 480, rootNote: "F", patternType: "scale", patternId: "ionian" },
      ], sectionMarkers: [],
    };
    expect(detectChordsFromNotes(notes, (note) => spellPitchClass(
      note.pitch, resolvePitchSnapSettings(timeMap, B_MAJOR, note.startTick),
    ))).toBe("d5");
  });
});
