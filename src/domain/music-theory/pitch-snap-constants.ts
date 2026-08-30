/** Pitch-snap roots and defaults. */
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
} as const);
