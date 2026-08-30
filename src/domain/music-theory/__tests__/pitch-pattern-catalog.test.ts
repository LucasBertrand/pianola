import { Chord } from "@tonaljs/tonal";
import { describe, expect, test } from "vitest";
import {
  formatChordSymbol,
  isSupportedPitchPatternId,
  CHORD_PATTERN_GROUPS,
  SUPPORTED_CHORD_PATTERN_IDS,
  SCALE_PATTERN_GROUPS,
  SUPPORTED_SCALE_PATTERN_IDS,
} from "../pitch-pattern-catalog";
import { formatAccidentals } from "../pitch-notation";

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

  test("groups the complete curated chord catalog by family", () => {
    expect(CHORD_PATTERN_GROUPS.map((group) => group.label)).toEqual([
      "Major",
      "Minor",
      "Sixths",
      "Dominant",
      "Suspended",
      "Diminished",
      "Augmented",
    ]);
    expect(SUPPORTED_CHORD_PATTERN_IDS).toEqual([
      "M", "maj7", "maj9", "maj13",
      "m", "m7", "mM7", "m9", "mM9", "m11", "m13",
      "6", "m6", "69", "m69",
      "7", "9", "7b9", "7#9", "11", "13",
      "sus2", "sus4", "sus24", "7sus4", "9sus4", "13sus4",
      "dim", "dim7", "m7b5",
      "aug",
    ]);
    expect(new Set(SUPPORTED_CHORD_PATTERN_IDS).size).toBe(SUPPORTED_CHORD_PATTERN_IDS.length);
  });

  test("derives option labels and rooted symbols from Tonal", () => {
    const minorMajorSeventh = CHORD_PATTERN_GROUPS
      .flatMap((group) => group.options)
      .find((option) => option.id === "mM7");

    expect(minorMajorSeventh?.label).toBe("mM7 (minor/major seventh)");
    expect(formatChordSymbol("C", "mM7")).toBe("CmM7");
    expect(formatChordSymbol("C", "sus2")).toBe("Csus2");
    expect(formatChordSymbol("C", "sus4")).toBe("Csus4");
    expect(formatChordSymbol("C", "7sus4")).toBe("C7sus4");
    expect(formatChordSymbol("C#", "69")).toBe("C♯69");
    expect(formatChordSymbol("C#", "7b9")).toBe("C♯7♭9");
    expect(formatChordSymbol("C#", "sus24")).toBe("C♯sus24");
    expect(formatChordSymbol("C#", "13sus4")).toBe("C♯13sus4");
    expect(formatChordSymbol("Db", "m7")).toBe("D♭m7");
    expect(formatAccidentals("C# / Db")).toBe("C♯ / D♭");

    for (const chordId of SUPPORTED_CHORD_PATTERN_IDS) {
      expect(Chord.getChord(chordId).empty).toBe(false);
    }
  });

  test("rejects entries outside the curated Tonal vocabulary", () => {
    expect(isSupportedPitchPatternId("scale", "ionian")).toBe(true);
    expect(isSupportedPitchPatternId("chord", "m13")).toBe(true);
    expect(isSupportedPitchPatternId("chord", "not-a-chord")).toBe(false);
    expect(() => formatChordSymbol("C", "not-a-chord")).toThrow(
      "Tonal does not recognize chord type",
    );
  });
});
