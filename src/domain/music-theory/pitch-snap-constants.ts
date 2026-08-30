import {
  SUPPORTED_CHORD_PATTERN_IDS,
  SUPPORTED_SCALE_PATTERN_IDS,
} from "./pitch-pattern-catalog";

/** Pitch-snap roots, supported pattern vocabulary and defaults. */
export const PITCH_SNAP_CONSTANTS = Object.freeze({
  defaultEnabled: false,
  defaultVisualGuideEnabled: true,
  defaultRootNote: "none",
  defaultPatternId: "chromatic",
  defaultScalePatternId: "ionian",
  defaultChordPatternId: "M",
  rootOptions: Object.freeze([
    "none", "Cb", "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B",
  ] as const),
  supportedScales: SUPPORTED_SCALE_PATTERN_IDS,
  supportedChords: SUPPORTED_CHORD_PATTERN_IDS,
} as const);
