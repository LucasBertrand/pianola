import { Chord } from "@tonaljs/tonal";
import { describe, expect, test } from "vitest";
import {
  formatTonalChordSymbol,
  isSupportedTonalPatternId,
  TONAL_CHORD_GROUPS,
  TONAL_CHORD_IDS,
  TONAL_SCALE_GROUPS,
  TONAL_SCALE_IDS,
} from "../tonal-pattern-catalog";

describe("tonal pattern catalog", () => {
  test("groups every supported scale without changing the existing vocabulary", () => {
    expect(TONAL_SCALE_GROUPS.map((group) => group.label)).toEqual([
      "Diatonic modes",
      "Minor and derivative scales",
      "Pentatonic and blues",
      "Traditional scales",
      "Symmetric scales",
    ]);
    expect(TONAL_SCALE_IDS).toHaveLength(19);
    expect(new Set(TONAL_SCALE_IDS).size).toBe(TONAL_SCALE_IDS.length);
  });

  test("groups suspended and extended chords", () => {
    expect(TONAL_CHORD_GROUPS.map((group) => group.label)).toEqual([
      "Triads",
      "Suspended chords",
      "Seventh chords",
      "Ninth chords",
      "Eleventh chords",
      "Thirteenth chords",
    ]);
    expect(TONAL_CHORD_IDS).toEqual(expect.arrayContaining([
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
    expect(new Set(TONAL_CHORD_IDS).size).toBe(TONAL_CHORD_IDS.length);
  });

  test("derives option labels and rooted symbols from Tonal", () => {
    const minorMajorSeventh = TONAL_CHORD_GROUPS
      .flatMap((group) => group.options)
      .find((option) => option.id === "mM7");

    expect(minorMajorSeventh?.label).toBe("mM7 (minor/major seventh)");
    expect(formatTonalChordSymbol("C", "mM7")).toBe("CmM7");
    expect(formatTonalChordSymbol("C", "sus2")).toBe("Csus2");
    expect(formatTonalChordSymbol("C", "sus4")).toBe("Csus4");
    expect(formatTonalChordSymbol("C", "7sus4")).toBe("C7sus4");

    for (const chordId of TONAL_CHORD_IDS) {
      expect(Chord.getChord(chordId).empty).toBe(false);
    }
  });

  test("rejects entries outside the curated Tonal vocabulary", () => {
    expect(isSupportedTonalPatternId("scale", "ionian")).toBe(true);
    expect(isSupportedTonalPatternId("chord", "m13")).toBe(true);
    expect(isSupportedTonalPatternId("chord", "not-a-chord")).toBe(false);
    expect(() => formatTonalChordSymbol("C", "not-a-chord")).toThrow(
      "Tonal does not recognize chord type",
    );
  });
});
