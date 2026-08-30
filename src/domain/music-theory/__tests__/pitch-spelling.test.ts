import { describe, expect, test } from "vitest";
import type { PitchSnapSettings } from "../pitch-snap";
import {
  formatPitchClass,
  spellMidiNote,
  spellPitchClass,
} from "../pitch-spelling";

const C_SHARP_MAJOR: PitchSnapSettings = {
  enabled: true,
  visualGuideEnabled: true,
  rootNote: "C#",
  patternType: "scale",
  patternId: "ionian",
};

describe("contextual pitch spelling", () => {
  test("uses Unicode accidentals for stored roots and contextual note labels", () => {
    expect(formatPitchClass("Bb")).toBe("B♭");
    expect(formatPitchClass("F#")).toBe("F♯");
    expect(spellPitchClass(61, C_SHARP_MAJOR)).toBe("C♯");
    expect(spellMidiNote(61, C_SHARP_MAJOR)).toBe("C♯4");
  });

  test("keeps the intended contextual spelling at octave boundaries", () => {
    const cFlatMajor: PitchSnapSettings = { ...C_SHARP_MAJOR, rootNote: "Cb" };
    expect(spellMidiNote(59, cFlatMajor)).toBe("C♭4");
    expect(spellMidiNote(71, cFlatMajor)).toBe("C♭5");
  });

  test("spells rootless chromatic labels with Unicode flats", () => {
    expect(spellMidiNote(70, { ...C_SHARP_MAJOR, rootNote: "none", patternId: "chromatic" }))
      .toBe("B♭4");
  });
});
