import { describe, expect, test } from "vitest";
import {
  CHORD_PATTERN_GROUPS,
  SCALE_PATTERN_GROUPS,
  SUPPORTED_CHORD_PATTERN_IDS,
  SUPPORTED_SCALE_PATTERN_IDS,
  formatMusicTheoryChordSymbol,
  getPitchPatternSemitones,
  isSupportedPitchPatternId,
} from "../pitch-pattern-catalog";

const SCALE_SEMITONES: Readonly<Record<string, readonly number[]>> = {
  ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10], "harmonic minor": [0, 2, 3, 5, 7, 8, 11],
  "melodic minor": [0, 2, 3, 5, 7, 9, 11],
  "phrygian dominant": [0, 1, 4, 5, 7, 8, 10],
  "double harmonic major": [0, 1, 4, 5, 7, 8, 11],
  "hungarian minor": [0, 2, 3, 6, 7, 8, 11],
  "major pentatonic": [0, 2, 4, 7, 9], "minor pentatonic": [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10], hirajoshi: [0, 2, 3, 7, 8],
  "in-sen": [0, 1, 5, 7, 10], "whole tone": [0, 2, 4, 6, 8, 10],
  diminished: [0, 2, 3, 5, 6, 8, 9, 11],
};

const CHORD_SEMITONES: Readonly<Record<string, readonly number[]>> = {
  M: [0, 4, 7], maj7: [0, 4, 7, 11], maj9: [0, 2, 4, 7, 11],
  maj11: [0, 2, 4, 5, 7, 11], maj13: [0, 2, 4, 7, 9, 11],
  m: [0, 3, 7], m6: [0, 3, 7, 9], m7: [0, 3, 7, 10],
  mM7: [0, 3, 7, 11], m9: [0, 2, 3, 7, 10], mM9: [0, 2, 3, 7, 11],
  m11: [0, 2, 3, 5, 7, 10], m13: [0, 2, 3, 7, 9, 10],
  "6": [0, 4, 7, 9], "6/9": [0, 2, 4, 7, 9], "m6/9": [0, 2, 3, 7, 9],
  "7": [0, 4, 7, 10], "9": [0, 2, 4, 7, 10],
  "7b9": [0, 1, 4, 7, 10], "7#9": [0, 3, 4, 7, 10],
  "11": [0, 2, 5, 7, 10],
  "13": [0, 2, 4, 7, 9, 10], sus2: [0, 2, 7], sus4: [0, 5, 7],
  sus24: [0, 2, 5, 7], "7sus4": [0, 5, 7, 10],
  "9sus4": [0, 2, 5, 7, 10], "13sus4": [0, 2, 5, 7, 9, 10],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10], aug: [0, 4, 8],
};

describe("pitch pattern catalog", () => {
  test("keeps the 19 supported scale pitch-class sets", () => {
    expect(SUPPORTED_SCALE_PATTERN_IDS).toHaveLength(19);
    expect(new Set(SUPPORTED_SCALE_PATTERN_IDS)).toEqual(
      new Set(Object.keys(SCALE_SEMITONES)),
    );
    for (const [id, semitones] of Object.entries(SCALE_SEMITONES)) {
      expect([...getPitchPatternSemitones("scale", id)].sort((a, b) => a - b))
        .toEqual(semitones);
    }
  });

  test("keeps every supported chord pitch-class set", () => {
    expect(SUPPORTED_CHORD_PATTERN_IDS).toHaveLength(32);
    expect(new Set(SUPPORTED_CHORD_PATTERN_IDS)).toEqual(
      new Set(Object.keys(CHORD_SEMITONES)),
    );
    for (const [id, semitones] of Object.entries(CHORD_SEMITONES)) {
      expect([...getPitchPatternSemitones("chord", id)].sort((a, b) => a - b))
        .toEqual(semitones);
    }
  });

  test("uses persisted IDs directly and renders MusicTheoryJS canonical symbols", () => {
    expect(formatMusicTheoryChordSymbol("C", "M")).toBe("C");
    expect(formatMusicTheoryChordSymbol("C", "mM7")).toBe("CmMaj7");
    expect(formatMusicTheoryChordSymbol("C", "dim7")).toBe("Cdim7");
    expect(formatMusicTheoryChordSymbol("C", "m7b5")).toBe("Cm7b5");
    expect(formatMusicTheoryChordSymbol("C", "aug")).toBe("Caug");
    expect(formatMusicTheoryChordSymbol("C", "6/9")).toBe("C6/9");
    expect(formatMusicTheoryChordSymbol("C", "7sus4")).toBe("C7sus4");
    expect(formatMusicTheoryChordSymbol("C", "9sus4")).toBe("C9sus4");
    expect(formatMusicTheoryChordSymbol("C", "13sus4")).toBe("C13sus4");
    expect(CHORD_PATTERN_GROUPS.flatMap((group) => group.options)
      .find((option) => option.id === "mM7")?.label).toBe("CmMaj7");
  });

  test("keeps the selector grouping and rejects unknown IDs", () => {
    expect(SCALE_PATTERN_GROUPS).toHaveLength(5);
    expect(CHORD_PATTERN_GROUPS.map((group) => group.label)).toEqual([
      "Major",
      "Minor",
      "Sixths",
      "Dominant",
      "Suspended",
      "Diminished",
      "Augmented",
    ]);
    expect(isSupportedPitchPatternId("scale", "ionian")).toBe(true);
    expect(isSupportedPitchPatternId("chord", "m13")).toBe(true);
    expect(isSupportedPitchPatternId("chord", "6/9")).toBe(true);
    expect(isSupportedPitchPatternId("chord", "7sus4")).toBe(true);
    expect(isSupportedPitchPatternId("chord", "9sus4")).toBe(true);
    expect(isSupportedPitchPatternId("chord", "13sus4")).toBe(true);
    expect(isSupportedPitchPatternId("chord", "not-a-chord")).toBe(false);
  });
});
