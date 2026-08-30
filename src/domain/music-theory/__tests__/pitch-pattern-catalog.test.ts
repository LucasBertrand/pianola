import { Chord } from "@tonaljs/tonal";
import { describe, expect, test } from "vitest";
import {
  formatTonalChordSymbol,
  isSupportedPitchPatternId,
  CHORD_PATTERN_GROUPS,
  SUPPORTED_CHORD_PATTERN_IDS,
  SCALE_PATTERN_GROUPS,
  SUPPORTED_SCALE_PATTERN_IDS,
} from "../pitch-pattern-catalog";

describe("pitch pattern catalog", () => {
  test("groups every supported scale without changing the existing vocabulary", () => {
    expect(SCALE_PATTERN_GROUPS.map((group) => group.label)).toEqual([
      "Diatonic modes",
      "Minor and derivative scales",
      "Pentatonic and blues",
      "Traditional scales",
      "Symmetric scales",
    ]);
    expect(SUPPORTED_SCALE_PATTERN_IDS).toHaveLength(19);
    expect(new Set(SUPPORTED_SCALE_PATTERN_IDS).size).toBe(SUPPORTED_SCALE_PATTERN_IDS.length);
  });

  test("groups suspended and extended chords", () => {
    expect(CHORD_PATTERN_GROUPS.map((group) => group.label)).toEqual([
      "Triads",
      "Suspended chords",
      "Seventh chords",
      "Ninth chords",
      "Eleventh chords",
      "Thirteenth chords",
    ]);
    expect(SUPPORTED_CHORD_PATTERN_IDS).toEqual(expect.arrayContaining([
      "sus2",
      "sus4",
      "7sus4",
      "maj9",
      "9",
      "mM9",
      "m9",
      "11",
      "m11",
      "maj13",
      "13",
      "m13",
    ]));
    expect(new Set(SUPPORTED_CHORD_PATTERN_IDS).size).toBe(SUPPORTED_CHORD_PATTERN_IDS.length);
  });

  test("derives option labels and rooted symbols from Tonal", () => {
    const minorMajorSeventh = CHORD_PATTERN_GROUPS
      .flatMap((group) => group.options)
      .find((option) => option.id === "mM7");

    expect(minorMajorSeventh?.label).toBe("mM7 (minor/major seventh)");
    expect(formatTonalChordSymbol("C", "mM7")).toBe("CmM7");
    expect(formatTonalChordSymbol("C", "sus2")).toBe("Csus2");
    expect(formatTonalChordSymbol("C", "sus4")).toBe("Csus4");
    expect(formatTonalChordSymbol("C", "7sus4")).toBe("C7sus4");

    for (const chordId of SUPPORTED_CHORD_PATTERN_IDS) {
      expect(Chord.getChord(chordId).empty).toBe(false);
    }
  });

  test("rejects entries outside the curated Tonal vocabulary", () => {
    expect(isSupportedPitchPatternId("scale", "ionian")).toBe(true);
    expect(isSupportedPitchPatternId("chord", "m13")).toBe(true);
    expect(isSupportedPitchPatternId("chord", "not-a-chord")).toBe(false);
    expect(() => formatTonalChordSymbol("C", "not-a-chord")).toThrow(
      "Tonal does not recognize chord type",
    );
  });
});
