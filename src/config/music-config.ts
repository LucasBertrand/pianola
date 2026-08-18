/** Tonal pitch-snap vocabulary and defaults. */
export const TONAL_SNAP_CONSTANTS = Object.freeze({
  defaultEnabled: false,
  defaultVisualGuideEnabled: false,
  defaultRootNote: "C",
  defaultPatternId: "ionian",
  rootOptions: Object.freeze([
    "Cb", "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B",
  ] as const),
  supportedScales: Object.freeze([
    "ionian",
    "dorian",
    "phrygian",
    "lydian",
    "mixolydian",
    "aeolian",
    "locrian",
    "harmonic minor",
    "melodic minor",
    "phrygian dominant",
    "double harmonic major",
    "hungarian minor",
    "major pentatonic",
    "minor pentatonic",
    "blues",
    "hirajoshi",
    "in sen",
    "whole tone",
    "diminished", // Remplace diminished-whole-half
    // diminished-half-whole peut être ignoré ou géré différemment si besoin
  ] as const),
  supportedChords: Object.freeze([
    "M",
    "m",
    "dim", // °
    "aug", // +
    "maj7", // Δ
    "7",
    "mM7", // mΔ
    "m7",
    "m7b5", // ∅
    "dim7", // °7
  ] as const),
} as const);

