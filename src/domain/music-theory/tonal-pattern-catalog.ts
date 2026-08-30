import { Chord } from "@tonaljs/tonal";

export interface TonalPatternOption {
  readonly id: string;
  readonly label: string;
}

export interface TonalPatternGroup {
  readonly label: string;
  readonly options: readonly TonalPatternOption[];
}

function createScaleOption(id: string): TonalPatternOption {
  return Object.freeze({ id, label: id });
}

function createChordOption(id: string): TonalPatternOption {
  const chord = Chord.getChord(id);

  if (chord.empty) {
    throw new Error(`Tonal does not recognize chord type "${id}".`);
  }

  return Object.freeze({
    id,
    label: `${chord.symbol} (${chord.name})`,
  });
}

function createGroup(
  label: string,
  ids: readonly string[],
  createOption: (id: string) => TonalPatternOption,
): TonalPatternGroup {
  return Object.freeze({
    label,
    options: Object.freeze(ids.map(createOption)),
  });
}

/** Supported scale choices, grouped for the tonal-marker selector. */
export const TONAL_SCALE_GROUPS: readonly TonalPatternGroup[] = Object.freeze([
  createGroup("Diatonic modes", [
    "ionian",
    "dorian",
    "phrygian",
    "lydian",
    "mixolydian",
    "aeolian",
    "locrian",
  ], createScaleOption),
  createGroup("Minor and derivative scales", [
    "harmonic minor",
    "melodic minor",
    "phrygian dominant",
    "double harmonic major",
    "hungarian minor",
  ], createScaleOption),
  createGroup("Pentatonic and blues", [
    "major pentatonic",
    "minor pentatonic",
    "blues",
  ], createScaleOption),
  createGroup("Traditional scales", [
    "hirajoshi",
    "in-sen",
  ], createScaleOption),
  createGroup("Symmetric scales", [
    "whole tone",
    "diminished",
  ], createScaleOption),
]);

/** Supported chord choices, including suspended and extended chords. */
export const TONAL_CHORD_GROUPS: readonly TonalPatternGroup[] = Object.freeze([
  createGroup("Triads", [
    "M",
    "m",
    "dim",
    "aug",
  ], createChordOption),
  createGroup("Suspended chords", [
    "sus2",
    "sus4",
    "7sus4",
  ], createChordOption),
  createGroup("Seventh chords", [
    "maj7",
    "7",
    "mM7",
    "m7",
    "m7b5",
    "dim7",
  ], createChordOption),
  createGroup("Ninth chords", [
    "maj9",
    "9",
    "mM9",
    "m9",
  ], createChordOption),
  createGroup("Eleventh chords", [
    "11",
    "m11",
  ], createChordOption),
  createGroup("Thirteenth chords", [
    "maj13",
    "13",
    "m13",
  ], createChordOption),
]);

export const TONAL_SCALE_IDS: readonly string[] = Object.freeze(
  TONAL_SCALE_GROUPS.flatMap((group) =>
    group.options.map((option) => option.id)
  ),
);

export const TONAL_CHORD_IDS: readonly string[] = Object.freeze(
  TONAL_CHORD_GROUPS.flatMap((group) =>
    group.options.map((option) => option.id)
  ),
);

const TONAL_SCALE_ID_SET = new Set(TONAL_SCALE_IDS);
const TONAL_CHORD_ID_SET = new Set(TONAL_CHORD_IDS);

export function isSupportedTonalPatternId(
  patternType: "scale" | "chord",
  patternId: string,
): boolean {
  return patternType === "scale"
    ? TONAL_SCALE_ID_SET.has(patternId)
    : TONAL_CHORD_ID_SET.has(patternId);
}

/** Formats a rooted chord with Tonal's own symbol instead of an alias guess. */
export function formatTonalChordSymbol(
  rootNote: string,
  chordId: string,
): string {
  const chord = Chord.getChord(chordId, rootNote);

  if (chord.empty) {
    throw new Error(
      `Tonal does not recognize chord type "${chordId}" at root "${rootNote}".`,
    );
  }

  return chord.symbol;
}
