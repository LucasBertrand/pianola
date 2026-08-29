import { describe, expect, test } from "vitest";
import {
  isPitchAllowedByTonalPattern,
  isSupportedTonalSelection,
  isTonalPatternId,
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
  test.each([
    ["maj9", [60, 62, 64, 67, 71], [61, 65]],
    ["m11", [60, 62, 63, 65, 67, 70], [61, 64]],
    ["maj13", [60, 62, 64, 67, 69, 71], [61, 65]],
  ] as const)("uses Tonal's intervals for %s", (patternId, allowed, rejected) => {
    const settings = chordSettings(patternId);

    for (const pitch of allowed) {
      expect(isPitchAllowedByTonalPattern(pitch, settings)).toBe(true);
    }

    for (const pitch of rejected) {
      expect(isPitchAllowedByTonalPattern(pitch, settings)).toBe(false);
    }
  });

  test("validates chromatic defaults and curated rooted patterns", () => {
    expect(isTonalPatternId("scale", "chromatic")).toBe(true);
    expect(isTonalPatternId("chord", "m13")).toBe(true);
    expect(isTonalPatternId("chord", "unknown")).toBe(false);
    expect(isSupportedTonalSelection("none", "scale", "chromatic"))
      .toBe(true);
    expect(isSupportedTonalSelection("C", "scale", "chromatic"))
      .toBe(false);
    expect(isSupportedTonalSelection("H", "chord", "m13"))
      .toBe(false);
  });
});
