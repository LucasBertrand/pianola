import { describe, expect, test } from "vitest";
import {
  APPLICATION_COLORS,
} from "../../../../styles/application-colors";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
} from "../../../../domain/music-theory/pitch-snap";
import { getPitchNoteColor } from "../note-style";

describe("note color style", () => {
  test("uses the pastel Chromatone C-to-B hue mapping", () => {
    expect(APPLICATION_COLORS.notes.pitchClassPalette).toEqual([
      "#99d65c",
      "#5cd65c",
      "#5cd699",
      "#5cd6d6",
      "#5c99d6",
      "#5c5cd6",
      "#995cd6",
      "#d65cd6",
      "#d65c99",
      "#d65c5c",
      "#d6995c",
      "#d6d65c",
    ]);
  });

  test("uses the twelve pitch-class colors in rootless chromatic mode", () => {
    const colors = Array.from(
      { length: 12 },
      (_, pitchClass) => getPitchNoteColor(
        60 + pitchClass,
        DEFAULT_PITCH_SNAP_SETTINGS,
      ),
    );

    expect(colors).toEqual(APPLICATION_COLORS.notes.pitchClassPalette);
  });

  test("wraps chromatic pitch classes across octaves", () => {
    expect(getPitchNoteColor(59, DEFAULT_PITCH_SNAP_SETTINGS)).toBe(
      APPLICATION_COLORS.notes.pitchClassPalette[11],
    );
    expect(getPitchNoteColor(72, DEFAULT_PITCH_SNAP_SETTINGS)).toBe(
      APPLICATION_COLORS.notes.pitchClassPalette[0],
    );
  });

  test("keeps absolute Chromatone colors when a tonal root is selected", () => {
    expect(getPitchNoteColor(62, {
      ...DEFAULT_PITCH_SNAP_SETTINGS,
      rootNote: "D",
      patternId: "ionian",
    })).toBe(APPLICATION_COLORS.notes.pitchClassPalette[2]);
  });

  test("uses the neutral color for a pitch outside the selected scale", () => {
    expect(getPitchNoteColor(60, {
      ...DEFAULT_PITCH_SNAP_SETTINGS,
      rootNote: "D",
      patternId: "ionian",
    })).toBe(APPLICATION_COLORS.notes.outOfScale);
  });
});
