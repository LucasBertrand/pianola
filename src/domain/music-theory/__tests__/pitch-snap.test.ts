import { describe, expect, test } from "vitest";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
  getPitchPatternDegreeLabel,
  isPitchIncludedInPattern,
  isSupportedPitchSnapSelection,
  isPitchPatternId,
  type PitchSnapSettings,
} from "../pitch-snap";

function chordSettings(patternId: string): PitchSnapSettings {
  return {
    enabled: true,
    visualGuideEnabled: true,
    rootNote: "C",
    patternType: "chord",
    patternId,
  };
}

describe("extended chord pitch snap", () => {
  test("shows the pitch guide by default", () => {
    expect(DEFAULT_PITCH_SNAP_SETTINGS.visualGuideEnabled).toBe(true);
  });

  test.each([
    ["sus2", [60, 62, 67], [63, 64, 65]],
    ["sus4", [60, 65, 67], [62, 63, 64]],
    ["7sus4", [60, 65, 67, 70], [62, 64, 71]],
    ["maj9", [60, 62, 64, 67, 71], [61, 65]],
    ["m11", [60, 62, 63, 65, 67, 70], [61, 64]],
    ["maj13", [60, 62, 64, 67, 69, 71], [61, 65]],
  ] as const)("uses Tonal's intervals for %s", (patternId, allowed, rejected) => {
    const settings = chordSettings(patternId);

    for (const pitch of allowed) {
      expect(isPitchIncludedInPattern(pitch, settings)).toBe(true);
    }

    for (const pitch of rejected) {
      expect(isPitchIncludedInPattern(pitch, settings)).toBe(false);
    }
  });

  test("validates chromatic defaults and curated rooted patterns", () => {
    expect(isPitchPatternId("scale", "chromatic")).toBe(true);
    expect(isPitchPatternId("chord", "m13")).toBe(true);
    expect(isPitchPatternId("chord", "unknown")).toBe(false);
    expect(isSupportedPitchSnapSelection("none", "scale", "chromatic"))
      .toBe(true);
    expect(isSupportedPitchSnapSelection("C", "scale", "chromatic"))
      .toBe(false);
    expect(isSupportedPitchSnapSelection("H", "chord", "m13"))
      .toBe(false);
  });

  test("formats contextual scale and extended-chord degrees", () => {
    expect(getPitchPatternDegreeLabel(63, {
      ...DEFAULT_PITCH_SNAP_SETTINGS,
      rootNote: "C",
      patternType: "scale",
      patternId: "dorian",
    })).toBe("♭3");
    expect(getPitchPatternDegreeLabel(66, {
      ...DEFAULT_PITCH_SNAP_SETTINGS,
      rootNote: "C",
      patternType: "scale",
      patternId: "lydian",
    })).toBe("♯4");
    expect(getPitchPatternDegreeLabel(62, chordSettings("maj9")))
      .toBe("9");
  });
});
