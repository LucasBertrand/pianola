import {
  TONAL_CHORD_IDS,
  TONAL_SCALE_IDS,
} from "./tonal-pattern-catalog";

/** Tonal pitch-snap roots, supported vocabulary and defaults. */
export const TONAL_SNAP_CONSTANTS = Object.freeze({
  defaultEnabled: false,
  defaultVisualGuideEnabled: true,
  defaultRootNote: "none",
  defaultPatternId: "chromatic",
  defaultScalePatternId: "ionian",
  defaultChordPatternId: "M",
  rootOptions: Object.freeze([
    "none", "Cb", "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B",
  ] as const),
  supportedScales: TONAL_SCALE_IDS,
  supportedChords: TONAL_CHORD_IDS,
} as const);
